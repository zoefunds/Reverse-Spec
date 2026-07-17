/**
 * GenLayer chain access (genlayer-js).
 *
 * Read path: public client, no wallet needed.
 * Write path: browser-wallet client (MetaMask / Rainbow / Zerion via
 * window.ethereum) — every state change is signed by the user; this app
 * never touches keys.
 */

import { createAccount, createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

import { CONFIG } from "@/lib/config";

const chain = CONFIG.network === "localnet" ? localnet : studionet;

type GLClient = ReturnType<typeof createClient>;

let readClient: GLClient | null = null;

export function getReadClient(): GLClient {
  // The RPC requires an attached account even for view calls; an
  // ephemeral unfunded account satisfies it and never signs anything.
  if (!readClient) {
    readClient = createClient({ chain, account: createAccount() });
  }
  return readClient;
}

export function getWriteClient(account: `0x${string}`): GLClient {
  const eth = (globalThis as { ethereum?: unknown }).ethereum;
  if (!eth) throw new Error("No browser wallet detected");
  return createClient({
    chain,
    account,
    // genlayer-js accepts an EIP-1193 provider for wallet signing.
    provider: eth as never,
  } as never);
}

export async function readContract<T = unknown>(
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  const result = await getReadClient().readContract({
    address: CONFIG.contractAddress,
    functionName,
    args,
    stateStatus: "accepted",
  } as never);
  return result as T;
}

export async function writeContract(
  account: `0x${string}`,
  functionName: string,
  args: unknown[],
  value: bigint = 0n,
): Promise<string> {
  const client = getWriteClient(account);
  const connect = (client as { connect?: (n: string) => Promise<void> }).connect;
  if (connect) await connect.call(client, CONFIG.network);
  const hash = await client.writeContract({
    address: CONFIG.contractAddress,
    functionName,
    args,
    value,
  } as never);
  return hash as string;
}

export async function waitForTx(hash: string) {
  return getReadClient().waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: false,
  } as never);
}
