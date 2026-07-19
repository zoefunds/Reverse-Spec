# PRODUCT_TRUTH_MAP — ReverseSpec Bounties

| Claim or feature | Status | Evidence | Safe wording | Visual treatment |
|---|---|---|---|---|
| Bounty creation escrows native GEN in the contract | working | payable `create_bounty`, E2E: 4 bounties, 63,000 GEN open escrow (live `/stats`) | "Creators escrow real GEN into the Intelligent Contract" | Real create-page screenshot + escrow counter from live stats |
| Validators fetch submission evidence inside consensus (GenVM web access) | working | contract `reverse_spec_bounties.py`; E2E verdict notes "evidence fetched" | "Validators fetch the artifact themselves — inside consensus" | Animated causal flow (Remotion diagram), labeled plainly |
| AI-validator consensus produces subjective verdicts | working | Real verdicts: DEEP_SOLUTION (composite 78, depth 91), REDEFINING (depth 100) on StudioNet | "Real consensus verdicts, reached on GenLayer StudioNet" | Real bounty-1 screenshot: verdict ring "78 — Deep solution" |
| Payout 85/10/5 with real native GEN transfers | working | finalize paid 47,500 GEN; `claim_rewards` verified (claimable zeroed) | "47,500 GEN paid out of the contract — claimed, not promised" | TransactionReceipt component with real numbers |
| On-chain conservation invariant | working | live `/stats` → `invariant.healthy: true`, obligations == balance | "A conservation invariant anyone can query" | MetricReveal: balance = escrow + unclaimed |
| 24/7 deployed stack | working | Fly.io backend (health-checked), Vercel frontend, live URLs respond | "Deployed and running 24/7" | Browser-frame screenshots of live URLs |
| Test coverage | working | 27 contract direct + 12 backend tests + typed build, CI | "27 contract tests, 12 API tests, CI green" | Small evidence card, no terminal theatrics |
| Network status | working with limitations | Contract on **StudioNet** (GenLayer test network) | "Live on GenLayer StudioNet today; built for mainnet" | Status line on end card + spoken qualification |
| Bounty marketplace with users | unclear / demo data | The 4 live bounties were authored by the team during E2E | "Live bounties on the platform" — never "our users" | Show bounties as product content, no user-count claims |
| Mainnet / production money | planned | none | Do **not** claim. Say "designed to become native to GenLayer mainnet" | Not shown as real; end-card status line only |
| Wallet auth (MetaMask/Rainbow/Zerion) | working | SIWE-style flow in backend + frontend | "Non-custodial wallet auth" | Header "Connect Wallet" visible in real screenshots |

Every on-screen claim in STORYBOARD.md maps to a row above.
