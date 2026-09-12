# Reverse Spec Bounties

**Solve the better problem.** A bounty protocol where the specification is a
starting hypothesis, not a contract — built on GenLayer Intelligent Contracts.

Traditional bounties reward compliance. ReverseSpec pays the solver who
discovers the *deeper* problem behind a spec and proves they solved it. The
verdict — subjective, high-stakes, and money-moving — is decided by GenLayer's
AI-validator consensus, not by any company or server.

## Live

| | |
|---|---|
| Frontend | https://reverse-spec.vercel.app |
| Backend API | https://reverse-spec-api.fly.dev (`/healthz` for status) |
| Contract (StudioNet) | `0x1DD671F0b8Be9e6fB7e7F2078261e1B840AF4439` |
| Repo | https://github.com/zoefunds/Reverse-Spec |

Proven live (v0.x, native-GEN era), not simulated: 4 funded bounties
(10,000–50,000 GEN), a real consensus evaluation with written validator
reasoning, and a payout verified by checking actual StudioNet wallet
balances after claim — 47,500 GEN and 2,500 GEN landed in the winner's and
creator's real wallets, confirmed independently of the contract's own
bookkeeping. See [MEMORY.md](MEMORY.md) for the full run log, including two
real production bugs found and fixed during live testing (a broken
native-transfer primitive, and an indexer RPC-quota exhaustion under
multi-machine HA).

**v1 milestone (current):** the contract was rewritten to a split-custody
design. Real value now moves in USDC on a Base Sepolia escrow contract
(`contracts/base/ReverseSpecEscrow.sol`, deployed at
`0xD9ED7d01FeFc1740CB5244c713C15c518a1c198d`), not in native GEN inside the
GenLayer contract. See "Why this needs GenLayer" and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) below for the current design.

## Why this needs GenLayer

- **Trustless adjudication of a subjective claim.** "You ignored the spec but
  solved the real problem" cannot be verified by `A == B` code. Independent
  AI validators reach consensus on it via a tolerant leader/validator scheme
  that never requires byte-identical LLM output to agree.
- **Real evidence, not prose.** Validators fetch every submission's public
  artifact (repo/gist/doc) *inside consensus* with GenVM web access and judge
  the fetched content. Rationale text alone can never win; a dead or empty
  link caps the evidence score automatically.
- **Split-custody value transfer.** GenLayer cannot custody an asset that
  lives on another chain, so real USDC is escrowed on a Base Sepolia
  Solidity contract (`contracts/base/ReverseSpecEscrow.sol`), while the
  GenLayer contract does judging only — it decides who gets what and
  exposes that decision via `get_base_payouts` for a relayer to execute as
  a real `settle()`/`claim()` on Base. Creator funds via `fund(bountyId,
  amount)`; the relayer confirms the deposit on GenLayer via
  `record_funding`, which is what actually opens the bounty. A strict
  conservation invariant (`check_escrow_invariant`: tracked open escrow ==
  sum of every live bounty's `reward_escrow`) is queryable on-chain and
  polled by the backend indexer.
- **Abandonment recovery, without a new griefing vector.** `close_submissions`
  isn't creator-exclusive — any solver with a live submission can also
  trigger it, so a creator who funds a bounty and then goes silent can never
  permanently strand a solver's unpaid work or the escrow itself. Both paths
  are gated on the bounty's `submission_deadline` having elapsed, so neither
  a solver nor an impatient creator can cut off competition the instant one
  submission lands.

## Architecture

```
frontend (Next.js, Vercel) ──── genlayer-js ────► ReverseSpecBounties
     │                                             Intelligent Contract
     │ REST                                        (GenLayer StudioNet)
     ▼                                                    ▲
backend (FastAPI, Fly.io 24/7) ── genlayer-py indexer ────┘
     │                                                     ▲
     ▼                                          backend/relayer/ (Node)
PostgreSQL (read-model: search, leaderboards, profiles)     │
                                                             ▼
                                             ReverseSpecEscrow.sol
                                             (USDC custody, Base Sepolia)
```

GenLayer judges, Base Sepolia custodies. The GenLayer contract never holds
funds; `backend/relayer/` bridges the two chains (`fundingRelay.js` watches
Base `Funded` events and calls `record_funding` on GenLayer;
`payoutRelay.js` reads `get_base_payouts` on GenLayer, calls
`escrow.settle()` on Base, then calls `mark_settled` back on GenLayer).

- **Contract** ([contracts/reverse_spec_bounties.py](contracts/reverse_spec_bounties.py)) — single
  ~1,646-line production contract; source of truth for bounty lifecycle,
  judging/consensus, and payout instructions (no fund custody).
- **Base Sepolia escrow** ([contracts/base/ReverseSpecEscrow.sol](contracts/base/ReverseSpecEscrow.sol)) —
  holds the real USDC (`fund`, `settle` (relayer-only), `claim`); deployed
  at `0xD9ED7d01FeFc1740CB5244c713C15c518a1c198d`.
- **Backend** ([backend/](backend/)) — wallet-signature auth (SIWE-style),
  mirror API, chain indexer, health checks. Runs 24/7 on Fly.io across 2
  machines (`auto_stop=off`, `min_machines_running=1`, health-check
  restarts); the indexer uses a Postgres advisory-lock leader election so
  only one machine polls the chain RPC at a time, self-healing on failover.
- **Frontend** ([frontend/](frontend/)) — Landing, Explorer, Bounty detail +
  submit, Create (escrow funding), Dashboard, Rewards + claim + leaderboard,
  Profiles, How-it-works. Wallet auth: MetaMask / Rainbow / Zerion.

## Quickstart (local)

```bash
# 1. database
cd backend && docker compose up -d

# 2. backend
python3 -m venv ../.venv && ../.venv/bin/pip install -r requirements.txt
cp .env.example .env
../.venv/bin/uvicorn app.main:app --reload --port 8000

# 3. frontend
cd ../frontend && npm install
cp .env.example .env.local
npm run dev   # http://localhost:3000
```

## Tests

```bash
# contract lint + schema validation
.venv/bin/genvm-lint check contracts/reverse_spec_bounties.py --json

# contract direct tests (33+) — covers PENDING_FUNDING/record_funding,
# submission-window/abandonment-recovery gating, and the tightened
# consensus tolerances
.venv/bin/pytest contracts-tests/direct/ -v

# backend API tests (12)
cd backend && ../.venv/bin/pytest tests/ -v

# frontend type-check + build
cd frontend && npm run build

# live smoke test against the deployed StudioNet contract + Base Sepolia
# escrow (creates a real bounty and funds it in USDC; StudioNet is gasless,
# Base Sepolia needs testnet ETH for gas)
.venv/bin/python scripts/e2e_full.py
```

## Documentation

- [SUBMISSION.md](SUBMISSION.md) — what this is, what problem it solves, how to use it (plain language)
- [ROADMAP.md](ROADMAP.md) — what's next and why this is worth continuing
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & decisions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Fly.io (24/7) + Vercel + contract
- [docs/API.md](docs/API.md) — REST endpoints
- [docs/CONTRACT.md](docs/CONTRACT.md) — contract surface & consensus design
- [MEMORY.md](MEMORY.md) — living project memory & full test/deploy history
