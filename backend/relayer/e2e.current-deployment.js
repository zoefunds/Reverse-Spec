/**
 * Full current-deployment release gate with an ephemeral solver.
 *
 * The creator key funds a fresh in-memory solver with small amounts of Base
 * Sepolia ETH and StudioNet GEN, then runs the real consensus-to-claim E2E.
 * The generated solver key is never printed or written to disk.
 */
import { JsonRpcProvider, parseEther, Wallet } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const creatorKey = process.env.E2E_CREATOR_PRIVATE_KEY;
if (!creatorKey) throw new Error("E2E_CREATOR_PRIVATE_KEY is required");
if (!process.env.E2E_EVIDENCE_URL) throw new Error("E2E_EVIDENCE_URL is required");

if (!process.env.E2E_SOLVER_PRIVATE_KEY) {
  const normalized = creatorKey.startsWith("0x") ? creatorKey : `0x${creatorKey}`;
  const solver = Wallet.createRandom();
  const { config } = await import("./config.js");
  const creatorBase = new Wallet(normalized, new JsonRpcProvider(config.baseSepolia.rpcUrl));
  await (await creatorBase.sendTransaction({
    to: solver.address,
    value: parseEther(process.env.E2E_SOLVER_BASE_ETH ?? "0.0001"),
  })).wait();

  const creatorGenLayer = createClient({
    chain: studionet,
    account: createAccount(normalized),
  });
  const fundingHash = await creatorGenLayer.sendTransaction({
    to: solver.address,
    value: parseEther(process.env.E2E_SOLVER_GEN ?? "10"),
  });
  await creatorGenLayer.waitForTransactionReceipt({
    hash: fundingHash,
    status: TransactionStatus.FINALIZED,
    interval: 3000,
    retries: 240,
  });
  process.env.E2E_SOLVER_PRIVATE_KEY = solver.privateKey;
  console.log(`ephemeral solver funded: ${solver.address}`);
}

await import("./e2e.payment-path.js");
