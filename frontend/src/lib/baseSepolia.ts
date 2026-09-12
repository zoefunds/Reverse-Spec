/**
 * Base Sepolia access (viem) — USDC escrow for bounty funding & claims.
 *
 * GenLayer no longer custodies funding directly: a creator funds a bounty
 * by depositing USDC into the ReverseSpecEscrow contract on Base Sepolia,
 * a trusted relayer confirms that deposit back on GenLayer
 * (`record_funding`), and payouts are claimed straight from the escrow
 * (`claim`) — never via a GenLayer call.
 *
 * Mirrors the pattern in lib/chain.ts: no wallet-connection framework,
 * just raw `window.ethereum` wrapped in a viem client for writes.
 */

import {
  createPublicClient, createWalletClient, custom, http, defineChain,
} from "viem";

import { CONFIG } from "@/lib/config";

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
});

export const USDC_ADDRESS = CONFIG.usdcAddress;
export const ESCROW_ADDRESS = CONFIG.escrowAddress;

export const USDC_ABI = [
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "allowance", stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ESCROW_ABI = [
  {
    type: "function", name: "fund", stateMutability: "nonpayable",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "claim", stateMutability: "nonpayable",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "claimable", stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

function eip1193() {
  const eth = (globalThis as { ethereum?: unknown }).ethereum;
  if (!eth) throw new Error("No browser wallet detected");
  return eth as Parameters<typeof custom>[0];
}

let publicClient: ReturnType<typeof createPublicClient> | null = null;

export function getBasePublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  }
  return publicClient;
}

function getBaseWalletClient(account: `0x${string}`) {
  return createWalletClient({
    chain: baseSepolia,
    account,
    transport: custom(eip1193()),
  });
}

const BASE_SEPOLIA_HEX = "0x14a34"; // 84532

/** Ensure the connected wallet is on Base Sepolia, adding it if unknown. */
export async function ensureBaseSepolia(account: `0x${string}`): Promise<void> {
  const wallet = getBaseWalletClient(account);
  try {
    await wallet.switchChain({ id: baseSepolia.id });
  } catch {
    try {
      await eip1193().request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: BASE_SEPOLIA_HEX,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        }],
      });
    } catch (e) {
      throw new Error(
        `Couldn't switch your wallet to Base Sepolia: ${
          e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

/**
 * Approve the escrow for `amountBaseUnits` USDC if the current allowance is
 * insufficient, then call `fund(bountyId, amountBaseUnits)`. Returns the
 * fund transaction hash (the last on-chain step, so callers know when the
 * deposit itself — not just the approval — has landed).
 */
export async function approveAndFund(
  account: `0x${string}`, bountyId: number, amountBaseUnits: bigint,
): Promise<`0x${string}`> {
  await ensureBaseSepolia(account);
  const wallet = getBaseWalletClient(account);
  const client = getBasePublicClient();

  const allowance = await client.readContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: "allowance",
    args: [account, ESCROW_ADDRESS],
  });
  if ((allowance as bigint) < amountBaseUnits) {
    const approveHash = await wallet.writeContract({
      address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve",
      args: [ESCROW_ADDRESS, amountBaseUnits],
    });
    const receipt = await client.waitForTransactionReceipt({ hash: approveHash });
    if (receipt.status !== "success") {
      throw new Error("USDC approval transaction failed");
    }
  }

  const fundHash = await wallet.writeContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "fund",
    args: [BigInt(bountyId), amountBaseUnits],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: fundHash });
  if (receipt.status !== "success") {
    throw new Error("Funding transaction failed on Base Sepolia");
  }
  return fundHash;
}

/** Read how much USDC `account` can currently claim for `bountyId`. */
export async function getClaimable(
  bountyId: number, account: `0x${string}`,
): Promise<bigint> {
  const client = getBasePublicClient();
  const value = await client.readContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "claimable",
    args: [BigInt(bountyId), account],
  });
  return value as bigint;
}

/** Claim `account`'s payout for `bountyId` from the Base Sepolia escrow. */
export async function claimPayout(
  account: `0x${string}`, bountyId: number,
): Promise<`0x${string}`> {
  await ensureBaseSepolia(account);
  const wallet = getBaseWalletClient(account);
  const client = getBasePublicClient();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: "claim",
    args: [BigInt(bountyId)],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Claim transaction failed on Base Sepolia");
  }
  return hash;
}
