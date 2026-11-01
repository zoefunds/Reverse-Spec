import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { assertSuccessfulExecution } from "./genlayer.js";

const suppliedKey = process.env.GENLAYER_DEPLOYER_PRIVATE_KEY;
if (!suppliedKey) throw new Error("GENLAYER_DEPLOYER_PRIVATE_KEY is required");
const privateKey = suppliedKey.startsWith("0x") ? suppliedKey : `0x${suppliedKey}`;

const sourceUrl = new URL("../../contracts/reverse_spec_bounties.py", import.meta.url);
const code = fs.readFileSync(fileURLToPath(sourceUrl), "utf8");
const account = createAccount(privateKey);
const client = createClient({ chain: studionet, account });

console.log(`Deploying from ${account.address}`);
const hash = await client.deployContract({ code, args: [] });
console.log(`Deployment transaction: ${hash}`);
const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
  interval: 5000,
  retries: 240,
});
assertSuccessfulExecution(receipt, "deployContract");
console.log(JSON.stringify({
  hash: receipt.hash ?? receipt.txId ?? hash,
  status: receipt.statusName ?? receipt.status,
  recipient: receipt.recipient ?? receipt.to_address,
  txDataDecoded: receipt.txDataDecoded,
  messages: receipt.messages,
}, null, 2));
