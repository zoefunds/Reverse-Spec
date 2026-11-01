# Architecture

Current production endpoints and addresses are maintained in
[`../MEMORY.md`](../MEMORY.md). The active Fly services are
`reverse-spec-production-api` and `reverse-spec-production-relayer`.

## Division of responsibility

| Layer | Role | Trust |
|---|---|---|
| Intelligent Contract (GenLayer StudioNet) | Bounty lifecycle, submissions, LLM evaluations, payout *decisions* | Source of truth for judging — consensus-verified; holds no funds |
| ReverseSpecEscrow.sol (Base Sepolia) | USDC custody — `fund`, `settle`, `claim` | Source of truth for *funds*; executes payout instructions relayed from GenLayer |
| backend/relayer/ (Node) | Active/passive bridge: funding uses `record_funding` → Base acknowledgement → `activate_funding`; payouts use `settle()` → `mark_settled` | Trusted relayer identity (owner-rotatable via `set_relayer`); PostgreSQL lease permits one writer while a standby provides liveness |
| FastAPI backend (Fly.io) | Auth sessions, search/filter read-model, indexer, monitoring | Untrusted cache; self-heals from chain |
| PostgreSQL | Mirrors + users/profiles + audit log | Rebuildable from chain state |
| Next.js frontend (Vercel) | UI; signs all transactions client-side | Holds no secrets, no keys |

## Split-custody design

The GenLayer contract cannot custody an asset that lives on another chain
(GenVM's EVM interop reaches contracts on GenLayer's own chain, not an
arbitrary external chain), so custody is split from judgment:

- **Judgment** (GenLayer): decides who gets paid, how much, and exposes
  that decision via the `get_base_payouts(bounty_id)` view. It never
  touches a private key or a token transfer.
- **Custody** (Base Sepolia `ReverseSpecEscrow.sol`): holds the real USDC.
  Creators `fund(bountyId, amount)` there; winners/creators later
  `claim(bountyId)` there. `settle()` is relayer-only and idempotent per
  bounty (`pool.settled`).
- **Bridge** (`backend/relayer/`, a Node service): the single trusted
  relayer address bridges both directions. `fundingRelay.js` watches
  Base's `Funded` event and calls `record_funding(bounty_id, funder,
  amount, base_tx_hash)` on GenLayer, which creates a non-active
  `FUNDING_COMMITTED` record. It then acknowledges the Base deposit and calls
  `activate_funding`, which alone credits and opens the bounty once the deposit
  clears `MIN_BOUNTY_ESCROW` (1.00 USDC). If the seven-day Base refund wins the
  race, `void_funding` returns the shell to `PENDING_FUNDING` instead.
  `payoutRelay.js` reads `get_base_payouts`, calls `escrow.settle()` on
  Base, then confirms with `mark_settled(bounty_id, base_tx_hash)` on
  GenLayer. All GenLayer-side confirmations are idempotent on
  `base_tx_hash` so a retried relay can never double-count.

The trusted identity remains singular, but the process is redundant. Two Fly
apps maintain independent encrypted replay volumes and compete for a shared
PostgreSQL session advisory lock. Only the lock holder starts either relay
loop. If its process or database session dies, PostgreSQL releases the lock and
the standby takes over; a live stop/takeover/failback drill verified this path.

Money can only move through the escrow contract, driven by relayer-relayed,
consensus-derived instructions. The frontend cannot spend on either chain;
the backend cannot spend on either chain.

## Value-transfer path

1. `create_bounty` (not payable — no value attached): creates a
   `PENDING_FUNDING` bounty shell with a chosen `submission_window_secs`.
2. Creator funds on Base Sepolia: `ReverseSpecEscrow.fund(bountyId,
   amount)` (USDC, 6 decimals; wallet must `approve` first).
3. Relayer commits: `record_funding` validates creator/funder identity and
   stores the deposit while the bounty remains non-active.
4. Relayer acknowledges the Base deposit, making it non-refundable, then
   `activate_funding` credits escrow and opens the bounty. If Base reports the
   deposit refunded first, `void_funding` removes the commitment. Thus an
   outage can delay activation but cannot produce an active unbacked bounty.
5. `finalize_bounty`: consensus verdict splits escrow into `claimable`
   ledger credits — 85% winner / 10% runner-up (absorbed by winner if
   none) / 5% creator reserve. Only submissions whose evaluation has
   `evidence_fetch_ok == True` are eligible to become winner/runner-up —
   an unverifiable claim can be ranked and shown but never paid.
   Pull-pattern, checks-effects-interactions.
6. `get_base_payouts(bounty_id)` (view): the relayer reads unsettled
   `{recipient, amount}` allocations and executes `escrow.settle()` on
   Base, then confirms with `mark_settled` — the terminal leg. GenLayer
   itself never sends value; `claim_rewards` no longer exists on the
   GenLayer contract, and `claim(bountyId)` on the Base escrow is how
   value actually reaches a wallet.
7. `cancel_bounty` / `reclaim_escrow`: refund paths for no-takers /
   below-bar outcomes, credited the same way and relayed to Base.
8. `check_escrow_invariant` (view): the GenLayer contract holds no funds,
   so this checks internal ledger self-consistency — tracked
   `total_open_escrow` must equal the sum of every live bounty's
   `reward_escrow` — rather than a real token balance. Polled by the
   indexer; violations are logged as errors.

## Consensus safety (why no UNDETERMINED)

The evaluation runs as a custom leader/validator nondet block:

- Structural checks (JSON shape, score ranges, required keys) are
  deterministic and mandatory — a malformed leader result is rejected.
- Semantic checks are *tolerant*: validators re-derive their own verdict and
  accept the leader within ±1 tier and ±12 banded composite points (tightened
  from ±20 — the looser "same-side-of-threshold" fallback was removed, so
  agreement is now strictly tier-gap ≤1 *and* score-gap ≤12).
- Validators must also match the leader's `evidence_fetch_ok` exactly (both
  fetched successfully, or both failed) — a payout-driving verdict can't be
  accepted when one side has an artifact to judge and the other doesn't.
- A validator whose independent web/LLM execution fails rejects the leader;
  financially consequential verdicts require completed independent verification.
- Scores are clamped and banded (width 5) before comparison so sampling
  noise cannot flip votes.
- At payout time, `finalize_bounty` additionally requires
  `evidence_fetch_ok == True` on the stored evaluation before a submission
  can become winner/runner-up — an unverifiable claim can be ranked/stored
  but never actually paid.

Funding scanning is acknowledgment-aware. Each discovered event is atomically
written to a durable pending queue together with the scan cursor before the
cursor can advance. Pending events retry independently through GenLayer
commitment, Base acknowledgement, and GenLayer activation, so one poison
deposit cannot block later ranges. A GenLayer transaction counts only after
`FINALIZED` and successful execution. The current SDK's canonical
`txExecutionResultName` is used when the network supplies it; StudioNet's
detailed leader execution receipt is the compatibility fallback. A contract
rollback or non-final decision stays queued. A funder can recover an
unacknowledged mistaken deposit after seven
days, and the relayer then voids any GenLayer commitment. Once Base
acknowledgement wins, refund is impossible and activation remains durably
retryable.

## Auth flow

```
wallet ──eth_requestAccounts──► frontend
frontend ──POST /auth/nonce──► backend (single-use, 5-min TTL, stored)
wallet ──personal_sign(message)──► frontend
frontend ──POST /auth/verify──► backend (ecrecover == address? burn nonce)
backend ──JWT (24h, HS256)──► frontend (sessionStorage)
```

On-chain transactions never touch the backend: genlayer-js signs through the
injected provider directly.

## Indexer

Async task inside the API process. Production polls every 120s (configurable): platform stats + invariant →
bounty pages → changed bounties' submissions → reward ledgers. All failures
degrade to a `degraded` status surfaced at `/healthz`; the API never dies
with it (24/7 requirement).

## Security

- SQLi: SQLAlchemy parameterized queries only. XSS: React escaping, no
  `dangerouslySetInnerHTML`. CSRF: Bearer tokens, no auth cookies.
- Security headers middleware (HSTS, nosniff, frame-deny, referrer policy).
- Rate limits: 120/min default, 20/min auth (slowapi, per IP).
- Nonce replay: single-use + TTL + signature recover match.
- Contract spam guards: min escrow (1.00 USDC), per-solver caps, submission
  caps, https-only public evidence URLs (private hosts rejected).
- `close_submissions` (creator or abandonment-recovery solver path) cannot
  fire until `submission_deadline` has elapsed, closing an exploit where a
  solver could shut out competition by closing submissions immediately
  after their own submission landed.
- Secrets via Fly secrets / Vercel env; none in the repo.
