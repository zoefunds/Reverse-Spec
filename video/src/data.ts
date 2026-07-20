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
  contractAddressFull: "0x1DD671F0b8Be9e6fB7e7F2078261e1B840AF4439",
  url: "reverse-spec.vercel.app",
  specExcerpt:
    "Specification: implement a dynamic slippage-tolerance widget that recommends a tolerance per pair based on 24h volatility…",
  tests: "27 contract tests · 12 API tests · CI green",
} as const;

export type LayoutMode = "landscape" | "vertical" | "square";
