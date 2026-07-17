/** Typed runtime configuration — single source for addresses/endpoints. */

export const CONFIG = {
  apiBase:
    process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1",
  contractAddress: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
    "0xbe5E27fF832B229EE584D02b82B4606030d34F40") as `0x${string}`,
  network: process.env.NEXT_PUBLIC_GENLAYER_NETWORK ?? "studionet",
} as const;

/** Protocol constants mirrored from the contract's get_config(). */
export const PROTOCOL = {
  minBountyEscrow: BigInt("1000000000000000"), // 0.001 GEN
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
