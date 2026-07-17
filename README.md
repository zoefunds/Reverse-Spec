# Reverse Spec Bounties

**Solve the better problem.** A bounty protocol where the specification is a
starting hypothesis, not a contract — built on GenLayer Intelligent Contracts.

Traditional bounties reward compliance. ReverseSpec pays the solver who
discovers the *deeper* problem behind a spec and proves they solved it. The
verdict — subjective, high-stakes, and money-moving — is decided by GenLayer's
AI-validator consensus, not by any company or server.

## Why this needs GenLayer

- **Trustless adjudication of a subjective claim.** "You ignored the spec but
  solved the real problem" cannot be verified by `A == B` code. Independent
  AI validators reach consensus on it via a tolerant leader/validator scheme.
- **Real evidence, not prose.** Validators fetch every submission's public
  artifact (repo/gist/doc) *inside consensus* with GenVM web access and judge
  the fetched content. Rationale text alone can never win.
- **A real value-transfer path.** Native GEN is escrowed in the contract at
  bounty creation (payable tx), split 85/10/5 on finalization, and claimed
  with actual native transfers out of the contract. A strict conservation
  invariant (`balance >= open escrow + unclaimed rewards`) is queryable
  on-chain and monitored by the backend.

## Architecture

```
frontend (Next.js, Vercel) ──── genlayer-js ────► ReverseSpecBounties
     │                                             Intelligent Contract
     │ REST                                        (GenLayer StudioNet)
     ▼                                                    ▲
backend (FastAPI, Fly.io 24/7) ── genlayer-py indexer ────┘
     │
     ▼
PostgreSQL (read-model: search, leaderboards, profiles)
```

- **Contract** ([contracts/reverse_spec_bounties.py](contracts/reverse_spec_bounties.py)) — single
  1,477-line production contract; source of truth for bounties, escrow,
  evaluations, payouts. StudioNet address:
  `0x79F636e231D22ffFAE68c4FB9e69223287a5D2C4`
- **Backend** ([backend/](backend/)) — wallet-signature auth (SIWE-style),
  mirror API, chain indexer, health checks. Runs 24/7 on Fly.io
  (`auto_stop=off`, `min_machines_running=1`, health-check restarts).
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

# contract direct tests (27)
.venv/bin/pytest contracts-tests/direct/ -v

# backend API tests (12)
cd backend && ../.venv/bin/pytest tests/ -v

# frontend type-check + build
cd frontend && npm run build
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & decisions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Fly.io (24/7) + Vercel + contract
- [docs/API.md](docs/API.md) — REST endpoints
- [docs/CONTRACT.md](docs/CONTRACT.md) — contract surface & consensus design
- [MEMORY.md](MEMORY.md) — living project memory
