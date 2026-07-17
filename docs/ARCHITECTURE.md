# Architecture

## Division of responsibility

| Layer | Role | Trust |
|---|---|---|
| Intelligent Contract (StudioNet) | Bounties, escrow, submissions, LLM evaluations, payouts | Source of truth — consensus-verified |
| FastAPI backend (Fly.io) | Auth sessions, search/filter read-model, indexer, monitoring | Untrusted cache; self-heals from chain |
| PostgreSQL | Mirrors + users/profiles + audit log | Rebuildable from chain state |
| Next.js frontend (Vercel) | UI; signs all transactions client-side | Holds no secrets, no keys |

Money can only move through the contract. The backend cannot spend, the
frontend cannot spend — only wallet-signed transactions evaluated by
validator consensus.

## Value-transfer path

1. `create_bounty` (payable): creator's GEN → contract escrow.
2. `finalize_bounty`: consensus verdict splits escrow into `claimable`
   credits — 85% winner / 10% runner-up (absorbed by winner if none) / 5%
   creator reserve. Pull-pattern, checks-effects-interactions.
3. `claim_rewards`: native transfer contract → recipient wallet.
4. `cancel_bounty` / `reclaim_escrow`: refund paths for no-takers /
   below-bar outcomes.
5. `check_escrow_invariant` (view): `balance >= open_escrow + unclaimed` —
   polled by the indexer; violations are logged as errors.

## Consensus safety (why no UNDETERMINED)

The evaluation runs as a custom leader/validator nondet block:

- Structural checks (JSON shape, score ranges, required keys) are
  deterministic and mandatory — a malformed leader result is rejected.
- Semantic checks are *tolerant*: validators re-derive their own verdict and
  accept the leader within ±1 tier and ±20 banded composite points, or when
  both land on the same side of the win threshold.
- A validator whose own web/LLM call fails infrastructurally accepts a
  structurally-valid leader instead of forcing rotation.
- Scores are clamped and banded (width 5) before comparison so sampling
  noise cannot flip votes.

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

Async task inside the API process. Every 30s: platform stats + invariant →
bounty pages → changed bounties' submissions → reward ledgers. All failures
degrade to a `degraded` status surfaced at `/healthz`; the API never dies
with it (24/7 requirement).

## Security

- SQLi: SQLAlchemy parameterized queries only. XSS: React escaping, no
  `dangerouslySetInnerHTML`. CSRF: Bearer tokens, no auth cookies.
- Security headers middleware (HSTS, nosniff, frame-deny, referrer policy).
- Rate limits: 120/min default, 20/min auth (slowapi, per IP).
- Nonce replay: single-use + TTL + signature recover match.
- Contract spam guards: min escrow, per-solver caps, submission caps,
  https-only public evidence URLs (private hosts rejected).
- Secrets via Fly secrets / Vercel env; none in the repo.
