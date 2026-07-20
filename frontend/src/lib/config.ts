/** Typed runtime configuration — single source for addresses/endpoints. */

export const CONFIG = {
  apiBase:
    process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1",
  contractAddress: (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
    "0x1DD671F0b8Be9e6fB7e7F2078261e1B840AF4439") as `0x${string}`,
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
