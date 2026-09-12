# v1 Milestone — Payout Safety + USDC on Base Sepolia

This document records everything done for the v1 milestone: the payout-safety
fixes flagged by team review, the migration of the funding currency from
native GEN to USDC on Base Sepolia, and the live acceptance testing that
proved the new contract end-to-end with real fund movement.

## 1. Context

Team review of the pre-v1 contract flagged three issues sitting directly on
the payout path:

1. A solver could force `close_submissions` immediately after their own
   submission landed, cutting off every other prospective competitor before
   they had a fair chance to compete.
2. A winning submission could be selected even when its evidence URL never
   fetched — an unverifiable claim could still drive a real payout.
3. Validator/leader consensus tolerance was loose enough that materially
   different scores or evidence-availability outcomes could still "agree,"
   letting a payout-driving verdict through on a shaky basis.

Separately, the project needed to support a more mainstream funding method
than native GEN: USDC on Base Sepolia. GenLayer's own EVM interop reaches
contracts on GenLayer's chain, not an arbitrary external chain, so the
funding currency could not simply be swapped in place — it required a
split-custody architecture.

## 2. Contract hardening (`contracts/reverse_spec_bounties.py`)

### Real submission window
- `create_bounty` now takes a `submission_window_secs` argument (bounded
  `MIN_SUBMISSION_WINDOW_SECS` = 1 hour to `MAX_SUBMISSION_WINDOW_SECS` = 30
  days).
- The bounty stores `opened_at` and `submission_deadline` (both computed at
  funding time — see below), using GenVM's deterministic transaction clock
  (`datetime.now(timezone.utc)`, pinned per-transaction so every validator
  re-executing sees the same value).
- `close_submissions` now requires `now >= submission_deadline` for **both**
  the creator and the abandonment-recovery solver path. Nobody — including
  whoever triggers the close — can shut the window early.

### Evidence must be verifiable to win
- `finalize_bounty`'s ranking loop only allows a submission to become
  `winner_id`/`runner_up_id` if its evaluation's `evidence_fetch_ok` is
  `True`. Unverifiable submissions are still evaluated and ranked for
  transparency, just excluded from payout eligibility.
- The validator function in `_run_consensus_evaluation` now also requires
  the validator's own `evidence_fetch_ok` to match the leader's exactly —
  a leader that fetched evidence and a validator that couldn't (or vice
  versa) can no longer be waved through as "agreeing."

### Tighter consensus tolerance
- `SCORE_TOLERANCE` reduced from 20 to 12.
- The old "same-side, wider tier gap" fallback branch in the validator
  function was removed entirely. Acceptance is now strictly
  `tier_gap <= TIER_TOLERANCE and score_gap <= SCORE_TOLERANCE` (and
  evidence availability matching, per above).

## 3. USDC on Base Sepolia — split-custody design

Modeled on the same pattern used by sibling projects on this machine
(Event-Weaver, Meme-olympics): GenLayer judges and computes payout
instructions; a Solidity escrow on Base Sepolia holds the real USDC; a
single trusted relayer bridges the two directions. GenLayer never touches a
private key or a token transfer.

### GenLayer contract changes
- Removed all native-GEN value-transfer machinery (`_send_gen`,
  `_PayableRecipient`, `EthSend` usage) — the contract no longer moves
  value itself.
- `create_bounty` is no longer payable. It creates a bounty in a new
  `PENDING_FUNDING` state.
- New relayer-only write `record_funding(bounty_id, funder, amount,
  base_tx_hash)`: idempotent on `base_tx_hash`, confirms a real Base
  Sepolia USDC deposit, and is the only thing that flips a bounty from
  `PENDING_FUNDING` to `OPEN` (computing `opened_at`/`submission_deadline`
  at that moment).
- New state: `owner`, `relayer` (both set to the deployer, `relayer`
  rotatable via owner-only `set_relayer`), and `applied_base_tx` for
  idempotency tracking.
- New view `get_base_payouts(bounty_id)`: aggregates every unsettled
  `reward_history` entry for a bounty by recipient — the payout instruction
  the relayer reads and relays to Base Sepolia.
- New relayer-only write `mark_settled(bounty_id, base_tx_hash)`:
  idempotent confirmation that the relayer successfully called `settle()`
  on Base Sepolia; closes out the unsettled ledger entries.
- Removed `claim_rewards` — claiming now happens on Base Sepolia via the
  escrow's own `claim()`, not on GenLayer.
- Funding amounts switched from 18-decimal native GEN to 6-decimal USDC
  base units throughout (`MIN_BOUNTY_ESCROW`, all payout math).
- `check_escrow_invariant` repurposed: since the contract never custodies
  USDC, it now checks internal ledger self-consistency (summed live-bounty
  escrow vs. tracked total) rather than a token balance.

### New Solidity escrow — `contracts/base/ReverseSpecEscrow.sol`
Minimal, no external dependencies (hand-rolled `IERC20` interface and
reentrancy guard, matching the sibling projects' pattern):
- `fund(bountyId, amount)` — `transferFrom` into the contract, emits
  `Funded`.
- `settle(bountyId, recipients, amounts)` — relayer-only, one-shot per
  bounty, credits `claimable[bountyId][recipient]`.
- `claim(bountyId)` — pull-based payout, checks-effects-interactions.
- `setRelayer`, `withdrawUnallocated` — owner-only.

### Deployment tooling — `contracts/base/deploy.js`
No Hardhat/Foundry project (matching how the sibling projects deploy):
a small Node script using the `solc` and `ethers` npm packages to compile
and deploy `ReverseSpecEscrow.sol` directly, reading the deployer/relayer
key from `BASE_SEPOLIA_RELAYER_PRIVATE_KEY`.

### Relayer service — `backend/relayer/`
Two polling loops:
- `fundingRelay.js` — scans Base Sepolia for confirmed `Funded` events,
  calls `record_funding` on GenLayer. Idempotent via GenLayer's own
  `applied_base_tx` check (not a local database), so it's safe to restart
  at any point.
- `payoutRelay.js` — scans GenLayer bounties in terminal states, reads
  `get_base_payouts`, submits `settle()` on Base Sepolia, then calls
  `mark_settled`.

### Backend / frontend
- `backend/app/core/config.py`, `.env.example`: new Base Sepolia / USDC /
  relayer configuration.
- `backend/app/db/models.py`, `schemas.py`, `api/bounties.py`,
  `services/indexer.py`: mirror the real `submission_window_secs`,
  `opened_at`, `submission_deadline` fields (migration
  `0002_submission_window.py`) — previously only the cosmetic, unenforced
  `deadline_note` was surfaced anywhere in the product.
- `frontend/src/lib/baseSepolia.ts` (new): viem-based Base Sepolia client
  for `fund`/`approve`/`claim`/`claimable`, network-switch handling.
- `frontend/src/lib/format.ts`: `formatUsdc`/`parseUsdc`, plus
  `formatDeadline`/`formatCountdown` for the real submission deadline.
- `frontend/src/app/create/page.tsx`: two-step flow — `create_bounty` on
  GenLayer (no value, with a submission-window selector), then
  `approve`+`fund` on the Base Sepolia escrow, then polls until the
  relayer confirms and the bounty flips to `OPEN`.
- `frontend/src/app/rewards/page.tsx`: claiming now reads
  `claimable(bountyId, address)` on the escrow and calls its `claim()`,
  since `claim_rewards` no longer exists on GenLayer.
- Every bounty amount display switched from GEN to USDC formatting across
  `bounty/[id]`, `dashboard`, `explorer`, `profile`, `components/bounty.tsx`.

## 4. Deployed addresses (this milestone's final, live state)

| Component | Address |
|---|---|
| GenLayer contract (StudioNet, chain 61999) | `0x324dff69efA46b82BcE267F5Ad6d30C2281397Df` |
| Base Sepolia escrow (`ReverseSpecEscrow.sol`) | `0xCDfF36cDA76e08BAd2EA0d5a3fDaDf3761Ed5041` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Owner / relayer (both contracts) | `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb` |

Two earlier GenLayer deployments and one earlier escrow deployment were
superseded during this milestone (see §6) and are not part of the live
product surface; the backend/frontend point only at the addresses above.

## 5. Live acceptance testing

Two independent, real product tests were run against the final contract
pair above — every write and non-admin read method exercised, with real
detailed data (no placeholders) and genuine USDC movement on Base Sepolia
at every funding, settlement, and claim step.

### Product test 1 — CI/CD Secret-Leak Prevention (bounties #1, #2)
- **#1** "Stop secrets leaking through CI build logs" — funded with a real
  15 USDC deposit. Three submissions (gitleaks, TruffleHog, and a plain
  regex-scrubbing approach that was withdrawn via `withdraw_submission`).
  Closed by the creator after the real 1-hour window elapsed. Real,
  unscripted LLM consensus evaluated the two live submissions against
  their actually-fetched evidence: gitleaks won (`DEEP_SOLUTION`, composite
  77), TruffleHog placed runner-up (`PARTIAL_DEPTH`, composite 71).
  Finalized to `RESOLVED`. Payout instruction read via `get_base_payouts`,
  settled for real on Base Sepolia (`settle()`), confirmed via
  `mark_settled`, and claimed for real by every recipient: winner received
  12.75 USDC, runner-up 1.5 USDC, creator's 5% reserve 0.75 USDC — all
  confirmed via on-chain wallet balance changes.
- **#2** a two-week pilot bounty — funded with a real 3 USDC deposit,
  cancelled via `cancel_bounty` before any submission arrived. The refund
  flowed through the identical `get_base_payouts` → `settle()` →
  `mark_settled` → `claim()` pipeline, proving the same payout rail handles
  both wins and refunds.

### Product test 2 — Recurring-Payment Retry Reliability (bounty #3)
- Funded with a real 15 USDC deposit. Two submissions, both linking
  evidence unrelated to the actual specification. Closed via the
  **solver-triggered abandonment-recovery path** (not the creator) once
  the real window elapsed. Real LLM consensus correctly scored both
  submissions `OFF_TOPIC` / composite 0 against their genuinely fetched
  (irrelevant) evidence — the bounty legitimately went `UNRESOLVED`, not
  by design shortcut but by authentic model judgment. Creator called
  `reclaim_escrow`; the full 15 USDC was settled and claimed for real.

### Coverage
Every non-admin write method was exercised at least once:
`create_bounty`, `record_funding`, `submit_solution`,
`withdraw_submission`, `cancel_bounty`, `close_submissions` (both the
creator-triggered and solver/abandonment-recovery paths),
`evaluate_submission`, `finalize_bounty`, `reclaim_escrow`, `mark_settled`
— plus the escrow's `fund`, `settle`, and `claim`. Every non-admin view
method was exercised: `get_bounty`, `get_bounty_page`, `get_submission`,
`get_bounty_submissions`, `get_evaluation`, `get_claimable`,
`get_solver_stats`, `get_leaderboard`, `get_platform_stats`,
`get_reward_history`, `get_audit_page`, `check_escrow_invariant`,
`get_config`, `get_base_payouts`. Owner-only configuration methods
(`set_relayer`/`setRelayer`) were intentionally left untouched by this
test, per scope.

Final state: `check_escrow_invariant` reports `healthy: true` with zero
outstanding escrow or unclaimed rewards; the production explorer shows all
three bounties in correct terminal states (`RESOLVED`, `CANCELLED`,
`RECLAIMED`) with zero console or transaction errors.

## 6. Notes and corrections made along the way

- An earlier test pass funded three bounties by calling `record_funding`
  directly as the relayer without a preceding real Base Sepolia deposit —
  a shortcut that skipped the actual USDC movement the milestone was
  supposed to prove. This was caught, and the entire test was redone from
  a fresh GenLayer contract and a freshly paired escrow deployment, this
  time performing the real `fund()` deposit before every `record_funding`
  call, with no shortcuts. The addresses in §4 are this corrected,
  final deployment.
- While fixing that, a real gap was also found and fixed: the actual
  contract-enforced `submission_deadline` (a precise, second-level
  timestamp) was never surfaced anywhere in the backend or frontend —
  only the cosmetic, unenforced `deadline_note` date string was shown.
  Backend models/schema/indexer and frontend formatting/display were
  updated to surface the real deadline and a live countdown.
- Production Postgres mirror tables were cleared of all prior-contract
  data before and after the final test run, so the live explorer reflects
  only the final contract's authentic state.

## 7. Deployment/ops summary

- Backend (Fly.io, `reverse-spec-bounties-api`): `GENLAYER_CONTRACT_ADDRESS`
  updated to the final contract; DB migration `0002_submission_window`
  applied via `release_command`.
- Frontend (Vercel, `reverse-spec.vercel.app`): `NEXT_PUBLIC_CONTRACT_ADDRESS`
  and `NEXT_PUBLIC_ESCROW_ADDRESS` updated; redeployed to production.
- `backend/relayer/` is not yet running as a standing service — it needs
  to be deployed (e.g. as its own Fly machine or a background process)
  with `BASE_SEPOLIA_RELAYER_PRIVATE_KEY` set as a secret before the
  funding/settlement flow works unattended in production. During this
  milestone's testing, funding and settlement were driven manually with
  the same relayer key to prove the mechanism end-to-end.
