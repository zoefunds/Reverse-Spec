/** Fast production smoke for the cross-chain funding state machine. */
import { randomUUID } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { config } from "./config.js";
import { assertSuccessfulExecution, plain } from "./genlayer.js";

const key = process.env.E2E_CREATOR_PRIVATE_KEY;
if (!key) throw new Error("E2E_CREATOR_PRIVATE_KEY is required");
if (!config.genlayerContractAddress || !config.baseSepolia.escrowAddress) {
  throw new Error("missing GenLayer or Base escrow address");
}

const normalizedKey = key.startsWith("0x") ? key : `0x${key}`;
const client = createClient({ chain: studionet, account: createAccount(normalizedKey) });
const provider = new JsonRpcProvider(config.baseSepolia.rpcUrl);
const wallet = new Wallet(normalizedKey, provider);
const usdc = new Contract(config.baseSepolia.usdcAddress, [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
], wallet);
const escrow = new Contract(config.baseSepolia.escrowAddress, [
  "function fund(uint256,uint256)",
  "function claim(uint256)",
  "function claimable(uint256,address) view returns (uint256)",
  "function deposits(uint256) view returns (uint256,address,uint256,uint64,bool,bool)",
  "function depositSeq() view returns (uint256)",
], wallet);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function write(functionName, args) {
  const hash = await client.writeContract({
    address: config.genlayerContractAddress, functionName, args, value: 0n,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash, status: TransactionStatus.FINALIZED, interval: 3000, retries: 240,
  });
  assertSuccessfulExecution(receipt, functionName);
  return hash;
}

async function read(functionName, args = []) {
  return plain(await client.readContract({
    address: config.genlayerContractAddress, functionName, args,
    stateStatus: "accepted",
  }));
}

async function poll(label, fn, timeoutMs = 15 * 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      console.warn(`transient ${label} read: ${error.shortMessage ?? error.message}`);
    }
    await sleep(5000);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const amount = BigInt(process.env.E2E_SMOKE_AMOUNT ?? "1000000");
const creationRef = `${wallet.address.toLowerCase()}:${randomUUID()}`;
const createTx = await write("create_bounty", [
  "Cross-chain funding activation smoke",
  "Verify that real Base USDC becomes active only after durable GenLayer commitment and Base acknowledgement.",
  "A safe deployment must never expose an active unbacked reward.",
  "Protocol", "smoke,base,usdc", new Date().toISOString(), "one-hour-window",
  3600, creationRef,
]);
const bountyId = Number(await read("get_bounty_id_by_creation_ref", [creationRef]));
if (!bountyId) throw new Error("creation reference did not resolve");

const depositId = (await escrow.depositSeq()) + 1n;
const approveReceipt = await (await usdc.approve(config.baseSepolia.escrowAddress, amount)).wait();
const fundReceipt = await (await escrow.fund(bountyId, amount)).wait();

await poll("automatic three-phase funding activation", async () => {
  const bounty = await read("get_bounty", [bountyId]);
  const deposit = await escrow.deposits(depositId);
  return bounty.status === "OPEN" && Boolean(deposit.acknowledged ?? deposit[4]);
});

const cancelTx = await write("cancel_bounty", [bountyId]);
const claimAmount = await poll("automatic Base settlement", async () => {
  const value = await escrow.claimable(bountyId, wallet.address);
  return value === amount ? value : null;
});
const before = await usdc.balanceOf(wallet.address);
const claimReceipt = await (await escrow.claim(bountyId)).wait();
const after = await usdc.balanceOf(wallet.address);
if (after - before !== claimAmount) throw new Error("claim delta mismatch");

console.log(JSON.stringify({
  status: "PASS", bountyId, depositId: depositId.toString(), amount: amount.toString(),
  createTx, approveTx: approveReceipt.hash, fundTx: fundReceipt.hash, cancelTx,
  claimTx: claimReceipt.hash, claimed: claimAmount.toString(),
}, null, 2));
