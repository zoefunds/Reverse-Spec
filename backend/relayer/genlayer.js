import { createClient, createAccount } from "genlayer-js";
import { studionet, localnet } from "genlayer-js/chains";
import { config } from "./config.js";

function chainFor(network) {
  return network === "localnet" ? localnet : studionet;
}

// GenLayer's RPC requires a sender ("from") even for reads, so the
// read-only client reuses the relayer's own account rather than an
// anonymous one — it never signs a transaction for reads, just supplies
// an address the RPC accepts.
let sharedClient = null;
function getSharedClient(logger) {
  if (sharedClient) return sharedClient;
  const account = createAccount(config.baseSepolia.relayerPrivateKey);
  sharedClient = createClient({ chain: chainFor(config.genlayerNetwork), account });
  if (logger) logger.info(`relayer GenLayer account ready: ${account.address}`);
  return sharedClient;
}

export async function readContract(functionName, args = []) {
  return getSharedClient().readContract({
    address: config.genlayerContractAddress,
    functionName,
    args,
  });
}

export function getWriteClient(logger) {
  return getSharedClient(logger);
}

export async function writeAndWait(logger, functionName, args) {
  const client = getWriteClient(logger);
  const hash = await client.writeContract({
    address: config.genlayerContractAddress,
    functionName,
    args,
    value: 0n,
  });
  await client.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED",
    interval: 3000,
    retries: 60,
  });
  return hash;
}

/** Normalize genlayer-js return values (Maps/BigInts) into plain JSON. */
export function plain(value) {
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) obj[k] = plain(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (value && typeof value === "object") {
    const obj = {};
    for (const [k, v] of Object.entries(value)) obj[k] = plain(v);
    return obj;
  }
  return value;
}
