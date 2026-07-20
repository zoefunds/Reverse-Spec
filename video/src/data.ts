// Real values only. Sources: live /stats API (frozen in public/stats.json),
// bounty #1 chain state, MEMORY.md E2E record. See PRODUCT_TRUTH_MAP.md.
export const DATA = {
  openEscrowGEN: 63000,
  totalPaidGEN: 47500,
  bountiesTotal: 4,
  bountiesResolved: 1,
  submissionsTotal: 4,
  invariantHealthy: true,
  verdictTier: "DEEP_SOLUTION",
  verdictComposite: 78,
  verdictDepth: 91,
  contractAddress: "0x79F6…D2C4",
  contractAddressFull: "0xb5f4C5C4B2162073fc1a0eA7de6EB9E0E9b8037b",
  url: "reverse-spec.vercel.app",
  specExcerpt:
    "Specification: implement a dynamic slippage-tolerance widget that recommends a tolerance per pair based on 24h volatility…",
  tests: "27 contract tests · 12 API tests · CI green",
} as const;

export type LayoutMode = "landscape" | "vertical" | "square";
