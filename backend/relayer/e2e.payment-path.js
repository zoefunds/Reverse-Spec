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
    hash, status: TransactionStatus.ACCEPTED, interval: 3000, retries: 120,
    fullTransaction: true,
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

const creator = glClient(creatorKey);
const solver = glClient(solverKey);
const base = new JsonRpcProvider(config.baseSepolia.rpcUrl);
const creatorWallet = new Wallet(normalizedKey(creatorKey), base);
const solverWallet = new Wallet(normalizedKey(solverKey), base);
const usdc = new Contract(config.baseSepolia.usdcAddress, USDC, creatorWallet);
const escrowCreator = new Contract(config.baseSepolia.escrowAddress, ESCROW, creatorWallet);
const escrowSolver = new Contract(config.baseSepolia.escrowAddress, ESCROW, solverWallet);

const amount = 5_000_000n;
let bountyId = Number(process.env.E2E_RESUME_BOUNTY_ID ?? 0);
let depositId = BigInt(process.env.E2E_RESUME_DEPOSIT_ID ?? 0);
if (!bountyId) {
  const creationRef = `${creatorWallet.address.toLowerCase()}:${randomUUID()}`;
  await write(creator, "create_bounty", [
    "Real cross-chain payment-path regression",
    "Build and verify the complete Base USDC to GenLayer adjudication and Base claim workflow without synthetic relay identifiers.",
    "The test must prove durable cross-chain acknowledgements and real custody movement.",
    "Protocol", "e2e,base,usdc,consensus", new Date().toISOString(), "one-hour-window", 3600, creationRef,
  ]);
  bountyId = Number(await read(creator, "get_bounty_id_by_creation_ref", [creationRef]));
  if (!bountyId) throw new Error("creation reference did not resolve");
  depositId = (await escrowCreator.depositSeq()) + 1n;
  await (await usdc.approve(config.baseSepolia.escrowAddress, amount)).wait();
  await (await escrowCreator.fund(bountyId, amount)).wait();
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

let submissionId = process.env.E2E_RESUME_SUBMISSION_TX ?? "";
if (!submissionId) {
  submissionId = await write(solver, "submit_solution", [
    bountyId, "Executable evidence for the real payment path",
    "The linked artifact demonstrates actual funding observation, independent consensus evaluation, settlement, and pull-based claiming.",
    evidenceUrl,
  ]);
}
console.log(`funded bounty=${bountyId}; submission tx=${submissionId}; waiting for protocol deadline`);

const knownDeadline = Number(process.env.E2E_RESUME_DEADLINE ?? 0);
const deadline = knownDeadline || Number((await read(creator, "get_bounty", [bountyId])).submission_deadline);
const deadlineWaitMs = Math.max(0, (deadline + 1) * 1000 - Date.now());
if (deadlineWaitMs) {
  console.log(`sleeping ${Math.ceil(deadlineWaitMs / 1000)}s until the contract deadline`);
  await sleep(deadlineWaitMs);
}
await write(creator, "close_submissions", [bountyId]);
const submissions = await read(creator, "get_bounty_submissions", [bountyId]);
const sid = Number(submissions[0].id);
await write(creator, "evaluate_submission", [sid]);
await write(creator, "finalize_bounty", [bountyId]);

const claims = await poll("automatic Base settlement", async () => {
  const creatorClaim = await escrowCreator.claimable(bountyId, creatorWallet.address);
  const solverClaim = await escrowSolver.claimable(bountyId, solverWallet.address);
  return creatorClaim + solverClaim === amount ? { creatorClaim, solverClaim } : null;
});
for (const [wallet, escrow, expected] of [
  [creatorWallet, escrowCreator, claims.creatorClaim],
  [solverWallet, escrowSolver, claims.solverClaim],
]) {
  if (expected === 0n) continue;
  const before = await usdc.balanceOf(wallet.address);
  await (await escrow.claim(bountyId)).wait();
  const after = await usdc.balanceOf(wallet.address);
  if (after - before !== expected) throw new Error(`claim delta mismatch for ${wallet.address}`);
}
console.log(`PASS bounty=${bountyId} creator_claim=${claims.creatorClaim} solver_claim=${claims.solverClaim}`);
