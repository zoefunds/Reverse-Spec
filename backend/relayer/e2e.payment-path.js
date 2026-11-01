/** Real two-chain E2E. This deliberately contains no synthetic
 * record_funding/mark_settled calls: a separately running relayer must observe
 * Base events and perform both acknowledgements.
 *
 * Required: E2E_CREATOR_PRIVATE_KEY, E2E_SOLVER_PRIVATE_KEY,
 * E2E_EVIDENCE_URL, GENLAYER_CONTRACT_ADDRESS, REVERSE_SPEC_ESCROW_ADDRESS,
 * BASE_SEPOLIA_RPC_URL. The creator needs Base Sepolia USDC/ETH and both
 * accounts need StudioNet gas. Runtime is at least the one-hour protocol floor.
 */
import { randomUUID } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { config } from "./config.js";
import { assertSuccessfulExecution } from "./genlayer.js";

const creatorKey = process.env.E2E_CREATOR_PRIVATE_KEY;
const solverKey = process.env.E2E_SOLVER_PRIVATE_KEY;
const evidenceUrl = process.env.E2E_EVIDENCE_URL;
if (!creatorKey || !solverKey || !evidenceUrl) throw new Error("missing E2E credentials/evidence URL");
if (!config.genlayerContractAddress || !config.baseSepolia.escrowAddress) {
  throw new Error("missing GenLayer or Base escrow address");
}

const USDC = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const ESCROW = [
  "function fund(uint256,uint256)",
  "function claim(uint256)",
  "function claimable(uint256,address) view returns (uint256)",
  "function deposits(uint256) view returns (uint256,address,uint256,uint64,bool,bool)",
  "function depositSeq() view returns (uint256)",
  "event Settled(uint256 indexed bountyId, uint256 recipientCount, uint256 allocated)",
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizedKey(key) {
  return key.startsWith("0x") ? key : `0x${key}`;
}
function glClient(key) {
  return createClient({ chain: studionet, account: createAccount(normalizedKey(key)) });
}
async function write(client, functionName, args) {
  const hash = await client.writeContract({ address: config.genlayerContractAddress, functionName, args, value: 0n });
  const receipt = await client.waitForTransactionReceipt({
    hash, status: TransactionStatus.FINALIZED, interval: 3000, retries: 240,
  });
  assertSuccessfulExecution(receipt, functionName);
  return hash;
}
async function read(client, functionName, args = []) {
  return plain(await client.readContract({ address: config.genlayerContractAddress, functionName, args, stateStatus: "accepted" }));
}
function plain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [key, plain(item)]));
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}
async function poll(label, fn, timeoutMs = 15 * 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      // Public testnet gateways occasionally return a proxy HTML page or a
      // transient 5xx. Polling is read-only and safe to retry until timeout.
      console.warn(`transient error while waiting for ${label}: ${error.shortMessage ?? error.message}`);
    }
    await sleep(5000);
  }
  throw new Error(`timeout waiting for ${label}`);
}
async function querySettledInChunks(contract, bountyId, fromBlock) {
  const latest = await contract.runner.provider.getBlockNumber();
  const logs = [];
  for (let start = fromBlock; start <= latest; start += 199) {
    const end = Math.min(start + 198, latest);
    logs.push(...await contract.queryFilter(contract.filters.Settled(bountyId), start, end));
  }
  return logs;
}

const creator = glClient(creatorKey);
const solver = glClient(solverKey);
const base = new JsonRpcProvider(config.baseSepolia.rpcUrl);
const creatorWallet = new Wallet(normalizedKey(creatorKey), base);
const solverWallet = new Wallet(normalizedKey(solverKey), base);
const usdc = new Contract(config.baseSepolia.usdcAddress, USDC, creatorWallet);
const escrowCreator = new Contract(config.baseSepolia.escrowAddress, ESCROW, creatorWallet);
const escrowSolver = new Contract(config.baseSepolia.escrowAddress, ESCROW, solverWallet);

const amount = BigInt(process.env.E2E_AMOUNT ?? "5000000");
let bountyId = Number(process.env.E2E_RESUME_BOUNTY_ID ?? 0);
let depositId = BigInt(process.env.E2E_RESUME_DEPOSIT_ID ?? 0);
let createTx = process.env.E2E_RESUME_CREATE_TX ?? "";
let approveTx = "";
let fundTx = "";
let fundingBlock = 0;
if (!bountyId) {
  const creationRef = `${creatorWallet.address.toLowerCase()}:${randomUUID()}`;
  createTx = await write(creator, "create_bounty", [
    "Real cross-chain payment-path regression",
    "Build and verify the complete Base USDC to GenLayer adjudication and Base claim workflow without synthetic relay identifiers.",
    "The test must prove durable cross-chain acknowledgements and real custody movement.",
    "Protocol", "e2e,base,usdc,consensus", new Date().toISOString(), "one-hour-window", 3600, creationRef,
  ]);
  bountyId = Number(await read(creator, "get_bounty_id_by_creation_ref", [creationRef]));
  if (!bountyId) throw new Error("creation reference did not resolve");
  depositId = (await escrowCreator.depositSeq()) + 1n;
  approveTx = (await (await usdc.approve(config.baseSepolia.escrowAddress, amount)).wait()).hash;
  const fundingReceipt = await (await escrowCreator.fund(bountyId, amount)).wait();
  fundTx = fundingReceipt.hash;
  fundingBlock = fundingReceipt.blockNumber;
} else if (!depositId) {
  throw new Error("E2E_RESUME_DEPOSIT_ID is required when resuming a bounty");
}
if (process.env.E2E_RESUME_ACKNOWLEDGED !== "true") {
  await poll("automatic funding acknowledgement", async () => {
    const bounty = await read(creator, "get_bounty", [bountyId]);
    const deposit = await escrowCreator.deposits(depositId);
    return bounty.status === "OPEN" && Boolean(deposit.acknowledged ?? deposit[4]);
  });
}
console.log(`funding acknowledged: bounty=${bountyId} deposit=${depositId}`);

let submissionTx = process.env.E2E_RESUME_SUBMISSION_TX ?? "";
if (!submissionTx) {
  submissionTx = await write(solver, "submit_solution", [
    bountyId, "Executable evidence for the real payment path",
    "The linked artifact demonstrates actual funding observation, independent consensus evaluation, settlement, and pull-based claiming.",
    evidenceUrl,
  ]);
}
console.log(`funded bounty=${bountyId}; submission tx=${submissionTx}; waiting for protocol deadline`);

const knownDeadline = Number(process.env.E2E_RESUME_DEADLINE ?? 0);
const deadline = knownDeadline || Number((await read(creator, "get_bounty", [bountyId])).submission_deadline);
const deadlineWaitMs = Math.max(0, (deadline + 1) * 1000 - Date.now());
if (deadlineWaitMs) {
  console.log(`sleeping ${Math.ceil(deadlineWaitMs / 1000)}s until the contract deadline`);
  await sleep(deadlineWaitMs);
}
const closeTx = await write(creator, "close_submissions", [bountyId]);
const submissions = await read(creator, "get_bounty_submissions", [bountyId]);
const sid = Number(submissions[0].id);
const evaluateTx = await write(creator, "evaluate_submission", [sid]);
const finalizeTx = await write(creator, "finalize_bounty", [bountyId]);

const claims = await poll("automatic Base settlement", async () => {
  const creatorClaim = await escrowCreator.claimable(bountyId, creatorWallet.address);
  const solverClaim = await escrowSolver.claimable(bountyId, solverWallet.address);
  return creatorClaim + solverClaim === amount ? { creatorClaim, solverClaim } : null;
});
const claimTransactions = {};
for (const [wallet, escrow, expected, label] of [
  [creatorWallet, escrowCreator, claims.creatorClaim, "creator"],
  [solverWallet, escrowSolver, claims.solverClaim, "solver"],
]) {
  if (expected === 0n) continue;
  const before = await usdc.balanceOf(wallet.address);
  const claimReceipt = await (await escrow.claim(bountyId)).wait();
  claimTransactions[label] = claimReceipt.hash;
  const after = await usdc.balanceOf(wallet.address);
  if (after - before !== expected) throw new Error(`claim delta mismatch for ${wallet.address}`);
}
const settlementLogs = await querySettledInChunks(
  escrowCreator, bountyId, fundingBlock || config.baseSepolia.fundingStartBlock,
);
console.log(JSON.stringify({
  status: "PASS", bountyId, depositId: depositId.toString(), amount: amount.toString(),
  createTx, approveTx, fundTx, submissionTx, closeTx, evaluateTx,
  finalizeTx, settlementTx: settlementLogs.at(-1)?.transactionHash ?? "",
  creatorClaim: claims.creatorClaim.toString(), solverClaim: claims.solverClaim.toString(),
  claimTransactions,
}, null, 2));
