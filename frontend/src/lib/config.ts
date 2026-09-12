/** Typed runtime configuration — single source for addresses/endpoints. */

export const CONFIG = {
  apiBase:
    process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1",
  contractAddress: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
    "0x1DD671F0b8Be9e6fB7e7F2078261e1B840AF4439") as `0x${string}`,
  network: process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet",
  /** Base Sepolia — where bounty funding/claims actually move USDC. */
  baseChainId: 84532,
  usdcAddress: (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`,
  escrowAddress: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ??
    "0xD9ED7d01FeFc1740CB5244c713C15c518a1c198d") as `0x${string}`,
} as const;

/**
 * Protocol constants mirrored from the contract's get_config(). Prefer
 * fetching get_config() live where a page already has a read client;
 * these are sane static defaults matching the deployed contract.
 */
export const PROTOCOL = {
  fundingCurrency: "USDC",
  usdcDecimals: 6,
  minBountyEscrow: 1_000_000n, // 1.00 USDC (6 decimals)
  minSubmissionWindowSecs: 3600, // 1 hour
  maxSubmissionWindowSecs: 30 * 86400, // 30 days
  winnerShareBps: 8500,
  runnerUpShareBps: 1000,
  creatorReserveBps: 500,
  winThreshold: 55,
  maxSubmissionsPerSolver: 3,
  tiers: [
    "OFF_TOPIC",
    "SPEC_ONLY",
    "PARTIAL_DEPTH",
    "DEEP_SOLUTION",
    "REDEFINING",
  ],
} as const;
