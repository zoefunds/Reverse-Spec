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

function glClient(key) {
  return createClient({ chain: studionet, account: createAccount(key) });
}
async function write(client, functionName, args) {
  const hash = await client.writeContract({ address: config.genlayerContractAddress, functionName, args, value: 0n });
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 3000, retries: 120 });
  return hash;
}
async function read(client, functionName, args = []) {
  return client.readContract({ address: config.genlayerContractAddress, functionName, args, stateStatus: "accepted" });
}
async function poll(label, fn, timeoutMs = 15 * 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(5000);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const creator = glClient(creatorKey);
const solver = glClient(solverKey);
const base = new JsonRpcProvider(config.baseSepolia.rpcUrl);
const creatorWallet = new Wallet(creatorKey, base);
const solverWallet = new Wallet(solverKey, base);
const usdc = new Contract(config.baseSepolia.usdcAddress, USDC, creatorWallet);
const escrowCreator = new Contract(config.baseSepolia.escrowAddress, ESCROW, creatorWallet);
const escrowSolver = new Contract(config.baseSepolia.escrowAddress, ESCROW, solverWallet);

const creationRef = `${creatorWallet.address.toLowerCase()}:${randomUUID()}`;
await write(creator, "create_bounty", [
  "Real cross-chain payment-path regression",
  "Build and verify the complete Base USDC to GenLayer adjudication and Base claim workflow without synthetic relay identifiers.",
  "The test must prove durable cross-chain acknowledgements and real custody movement.",
  "Protocol", "e2e,base,usdc,consensus", new Date().toISOString(), "one-hour-window", 3600, creationRef,
]);
const bountyId = Number(await read(creator, "get_bounty_id_by_creation_ref", [creationRef]));
if (!bountyId) throw new Error("creation reference did not resolve");

const amount = 5_000_000n;
const depositId = (await escrowCreator.depositSeq()) + 1n;
await (await usdc.approve(config.baseSepolia.escrowAddress, amount)).wait();
await (await escrowCreator.fund(bountyId, amount)).wait();
await poll("automatic funding acknowledgement", async () => {
  const bounty = await read(creator, "get_bounty", [bountyId]);
  const deposit = await escrowCreator.deposits(depositId);
  return bounty.status === "OPEN" && deposit.acknowledged;
});

const submissionId = await write(solver, "submit_solution", [
  bountyId, "Executable evidence for the real payment path",
  "The linked artifact demonstrates actual funding observation, independent consensus evaluation, settlement, and pull-based claiming.",
  evidenceUrl,
]);
console.log(`funded bounty=${bountyId}; submission tx=${submissionId}; waiting for protocol deadline`);

await poll("submission deadline", async () => {
  const bounty = await read(creator, "get_bounty", [bountyId]);
  return Math.floor(Date.now() / 1000) > Number(bounty.submission_deadline);
}, 75 * 60_000);
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
