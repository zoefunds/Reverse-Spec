import { createClient, createAccount } from "genlayer-js";
import { studionet, localnet } from "genlayer-js/chains";
import { config } from "./config.js";

function chainFor(network) {
  return network === "localnet" ? localnet : studionet;
}

const readClient = createClient({ chain: chainFor(config.genlayerNetwork) });

export async function readContract(functionName, args = []) {
  return readClient.readContract({
    address: config.genlayerContractAddress,
    functionName,
    args,
  });
}

let writeClient = null;
export function getWriteClient(logger) {
  if (writeClient) return writeClient;
  const account = createAccount(config.baseSepolia.relayerPrivateKey);
  writeClient = createClient({ chain: chainFor(config.genlayerNetwork), account });
  logger.info(`relayer GenLayer account ready: ${account.address}`);
  return writeClient;
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
