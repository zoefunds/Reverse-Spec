import { createClient, createAccount } from "genlayer-js";
import { studionet, localnet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
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
  return plain(await getSharedClient().readContract({
    address: config.genlayerContractAddress,
    functionName,
    args,
  }));
}

export function getWriteClient(logger) {
  return getSharedClient(logger);
}

/** Require durable finalization and successful contract execution.
 * Prefer the SDK's canonical execution-result field. StudioNet's compatibility
 * RPC omits that field, so use its detailed leader receipt only as a fallback.
 */
export function assertFinalizedSuccess(receipt, functionName = "transaction") {
  const normalized = plain(receipt);
  const status = normalized.statusName ?? normalized.status_name;
  const finalized = status === TransactionStatus.FINALIZED ||
    Number(normalized.status) === 7;
  if (!finalized) {
    throw new Error(`${functionName} did not reach FINALIZED (status=${status ?? normalized.status ?? "unknown"})`);
  }

  if (normalized.txExecutionResultName != null) {
    if (normalized.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
      throw new Error(
        `${functionName} finalized but contract execution failed: ${normalized.txExecutionResultName}`,
      );
    }
    return normalized;
  }

  const leaders = (normalized.consensus_data?.leader_receipt ?? [])
    .filter((item) => item?.mode === "leader");
  if (leaders.length === 0) {
    throw new Error(`${functionName} finalized without an execution result`);
  }
  const execution = leaders.at(-1);
  const genvm = execution.genvm_result ?? {};
  const returned = execution.result?.status;
  if (execution.execution_result !== "SUCCESS" || genvm.raw_error != null ||
      genvm.error_code != null || (returned != null && returned !== "return")) {
    const detail = genvm.error_description ?? genvm.error_code ??
      execution.execution_result ?? "unknown execution failure";
    throw new Error(`${functionName} finalized but contract execution failed: ${detail}`);
  }
  return normalized;
}

export const assertSuccessfulExecution = assertFinalizedSuccess;

export async function writeAndWait(logger, functionName, args, deps = {}) {
  const client = deps.client ?? getWriteClient(logger);
  const hash = await client.writeContract({
    address: config.genlayerContractAddress,
    functionName,
    args,
    value: 0n,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 3000,
    retries: 120,
  });
  assertFinalizedSuccess(receipt, functionName);
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
