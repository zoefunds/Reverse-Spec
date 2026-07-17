# Reverse Spec Bounties — Project Memory

Living record of decisions, progress, and state. Updated at the end of every stage.

## Project
- **Name:** Reverse Spec Bounties — bounty platform that rewards solving the *deeper* problem, not spec compliance. GenLayer Intelligent Contract evaluates submissions with LLM + contract-side web evidence fetching.
- **Root:** `/Users/macbook/Reverse-Spec`
- **Started:** 2026-07-17

## Locked Architecture Decisions (2026-07-17)
- **Backend:** FastAPI (Python 3.12) + PostgreSQL. Dev DB: Docker Postgres. Prod DB: Fly managed Postgres.
- **Hosting:** Backend on Fly.io — 24/7 requirement: `min_machines_running=1`, `auto_stop_machines="off"`, health checks, auto-restart. Frontend on Vercel. Both CLIs already installed.
- **Auth:** Wallet Authentication (MetaMask / Rainbow / Zerion, injected providers). SIWE-style nonce+signature → JWT. Non-custodial: backend never holds keys.
- **Source of truth:** the Intelligent Contract (bounties, escrow, evaluations, payouts). Postgres is a read-model kept in sync by an indexer worker.
- **Value transfer:** REAL native GEN escrow in the contract — payable `create_bounty`, escrow accounting in `u256`, on-chain payout to winners, refund/reclaim path for expired bounties.
- **Contract:** ONE production contract `contracts/reverse_spec_bounties.py`, 1000+ lines, GenLayer storage types only (TreeMap/DynArray/allow_storage dataclasses — never raw dict/list), pinned Depends header, comparative (non-strict) equivalence to avoid leader rotation / UNDETERMINED. Contract fetches submission evidence (repo URL) itself via web access — never judges user prose alone.
- **Deployment of contract:** the USER deploys to StudioNet via GenLayer Studio and provides the address. I never deploy the contract.
- **Design:** rebuild of the user's prototypes (`~/Documents/design/Reverse-Spec/`) with balanced layout and a REDUCED type scale (hero ≤36px, body 14–15px). Dark-mode "Modern Engineering" system per DESIGN.md. Custom SVG logo/favicon: mirrored spec-bracket mark.

## Review-team constraints (must hold)
1. One serious project, no thin demos.
2. Validator consensus must be essential (it is: trustless adjudication of subjective "better problem" verdicts + escrowed payouts).
3. Original work.
4. Validators verify actual outcome, not JSON shape.
5. Contract checks real evidence via web fetch.
6. Full source in repo.

## Progress
- [x] Planning & architecture approved by user (2026-07-17)
- [ ] Stage 1: Scaffold
- [ ] Stage 2: Intelligent Contract (then USER deploys, gives address)
- [ ] Stage 3: Backend (FastAPI + Postgres + indexer)
- [ ] Stage 4: Frontend (Next.js, all pages)
- [ ] Stage 5: Testing
- [ ] Stage 6: Deploy (Fly.io 24/7 + Vercel)

## Deployed addresses / endpoints
- Contract (StudioNet): _pending user deployment_
- Backend (Fly.io): _pending_
- Frontend (Vercel): _pending_

## Notes
- README's "generate Python scripts for file edits" assumed a chat-only workflow; running inside Claude Code with direct file tools, so files are created directly. `scripts/` still holds deploy/seed/db scripts.
