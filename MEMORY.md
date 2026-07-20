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
- [x] Stage 1: Scaffold (2026-07-17)
- [x] Stage 2: Contract — 1,477 lines, genvm-lint clean, schema validates (22 methods), 27 direct tests pass. Deployed by user.
- [x] Stage 3: Backend — FastAPI, wallet auth, indexer, Fly 24/7 config, 12 tests pass
- [x] Stage 4: Frontend — Next.js 14, 10 routes, wallet + genlayer-js, prod build green, visually verified
- [x] Stage 5: Testing — 27 contract direct + 12 backend + 4 StudioNet integration smoke + typed build; CI workflow added
- [x] Stage 6: Deployed 2026-07-17 — backend live on Fly (2 machines, indexer healthy against StudioNet contract), frontend live on Vercel, CORS locked

## Deployed addresses / endpoints
- Contract (StudioNet): `0xb5f4C5C4B2162073fc1a0eA7de6EB9E0E9b8037b` (v2, deployed by user 2026-07-17 — includes the claim_rewards emit_transfer fix; old address 0xbe5E...F40 retired, DB mirrors wiped)
- Backend (Fly.io): https://reverse-spec-api.fly.dev (app reverse-spec-api, DB reverse-spec-db, region iad)
- Frontend (Vercel): https://reverse-spec.vercel.app (project reverse-spec, scope adebiyi2002gmailcoms-projects)

## Notes
- README's "generate Python scripts for file edits" assumed a chat-only workflow; running inside Claude Code with direct file tools, so files are created directly. `scripts/` still holds deploy/seed/db scripts.

## E2E verification on contract v2 (2026-07-17)
- 4 professional bounties live: MEV/DEX 50k, GPU cold-start 35k, webhooks 18k, audit-scanner 10k GEN.
- Full lifecycle on bounty 1: real consensus verdict DEEP_SOLUTION (composite 78, depth 91, evidence fetched), finalize paid 47,500 GEN, claim_rewards WORKS (claimable zeroed), creator reserve claimed.
- Final chain state: 63,000 GEN open escrow, 47,500 paid out, invariant healthy.
- E2E keys for test accounts persisted in scripts/.e2e_keys_v2.json (gitignored).

## Escrow audit against ShipBond reference pattern (2026-07-17)
User supplied a battle-tested escrow brief (custody/emission separation,
zero-then-transfer ordering, double-spend guards, enumerated exit paths)
from an existing project (github.com/ometere123/shipbond). Audited our
contract line-by-line against it:
- Payable entry, gl.message.value as sole authority, terms-vs-ledger field
  split (initial_escrow vs reward_escrow), single emission choke point
  (claim_rewards -> gl.get_contract_at().emit_transfer), zero-before-transfer
  ordering, explicit double-claim guard, gl.vm.UserError usage, u256 money
  types — ALL already matched the brief's pattern (independently arrived at
  the same design, plus already proven live with a real 47,500 GEN payout).
- ONE real gap found: no abandonment-recovery exit. `close_submissions` was
  creator-only, so a creator who funds a bounty, receives real submissions,
  then goes silent, would permanently strand both the escrow and every
  solver's unpaid work — exactly the "timeout/recovery exit people forget"
  the brief calls out. Fixed: close_submissions is now callable by the
  creator OR any solver with a live (non-withdrawn) submission on that
  bounty — a stakeholder-triggered escape hatch, not open-to-anyone (avoids
  a stranger prematurely cutting off submissions). No wall-clock dependence
  added, preserving the deliberate no-timestamp consensus-determinism
  design. Added 4 new tests (33 total, all passing); genvm-lint clean;
  schema still validates (22 methods).
- **This change is NOT yet deployed** — contract logic changed, so it
  needs a fresh StudioNet deployment by the user and a new address before
  going live, per the established workflow (Claude never deploys).

## Contract v3 rollout (0xb5f4...037b) — abandonment recovery live (2026-07-20)
- Address rolled out across repo, DB mirrors wiped, backend + frontend
  redeployed. Full e2e rerun: 4 bounties (10k-50k GEN), abandonment-recovery
  path exercised for real (solver_a called close_submissions instead of the
  creator, who never touched the bounty) -> real consensus verdict
  (DEEP_SOLUTION, composite 78) -> finalize -> 47,500 GEN claimed, zeroed
  correctly. Invariant healthy.
- Found and fixed a real production issue during rollout: StudioNet RPC has
  a 500 req/hour limit; the indexer was running on both Fly machines AND
  both had --workers 2 in the Dockerfile, so 4 processes were polling
  independently (~4x the intended load), tripping the limit and reporting
  "degraded". Fixed with a Postgres advisory-lock leader election
  (`pg_try_advisory_lock`) so exactly one process indexes at a time —
  verified via `pg_locks` that precisely one session holds the lock.
  Dropped Dockerfile to --workers 1 (HA already comes from 2 Fly machines,
  not workers-per-machine) and raised INDEXER_INTERVAL_SECONDS 30 -> 120
  for RPC quota headroom as bounty/address count grows. Non-leader
  machines now report indexer state "standby" (new, expected) rather than
  "degraded".

## Indexer leader-election bug found and fixed post-deploy (2026-07-20)
The first advisory-lock fix (held one long-lived connection per process,
acquired once) had a real flaw: if that connection silently died between
cycles (idle timeout / network blip), Postgres auto-released the lock
server-side but the Python-side state never noticed, so the process kept
calling run_cycle() on the stale belief it was still leader — and a second
machine could then also acquire the lock. Confirmed in production: both
machines self-reported indexer state "healthy" simultaneously while
`pg_locks` showed ZERO actual advisory-lock holders at that moment.
Fixed by acquiring and releasing the lock fresh every single cycle
(`_run_cycle_if_leader`) instead of holding one connection for the process
lifetime — each cycle's leadership is independently re-proven, never
assumed. This also changes the design from "one sticky leader" to "one
leader per cycle, may rotate between machines" — which is fine and
actually more robust, since the real goal was never pinning leadership to
one machine, only preventing simultaneous double-polling of the rate
limited StudioNet RPC. Verified post-fix: zero "Rate limit exceeded" or
"indexer cycle failed" log lines, /api/v1/stats fully synced and matching
on-chain state, escrow invariant healthy.

## CRITICAL FIX: claim_rewards never actually delivered GEN to wallets (2026-07-20)

**Found by direct user verification** ("the claim reward did not send the gen
to receiver wallet — check well") after I had wrongly treated a zeroed
`claimable` ledger + `settled: True` history record as proof of a successful
transfer. Checked the ACTUAL wallet balance on StudioNet for solver_a (who
"claimed" 47,500 GEN in an earlier test run): **0 GEN**. Contract balance had
correctly dropped by the paid-out amount (113,000 -> 63,000), meaning the GEN
left the contract but arrived nowhere — genuinely lost, not merely un-recorded.

Root cause: `claim_rewards` used `gl.get_contract_at(recipient).emit_transfer(...)`.
`get_contract_at` is GenVM's *contract-to-contract call* primitive (PostMessage) —
it expects the target to be a deployed GenVM contract that can catch the
message via `__receive__`. A plain wallet (EOA) has no such code, so the
message (and its attached value) is dropped with no error surfaced back to
the caller. Confirmed by reading a second working project on this machine
(`~/Meme-olympics/contracts/meme_olympics.py`, same pinned Depends hash),
whose own code comment states this exact failure mode explicitly: "fails
with 'Contract ... not found' against any address without deployed contract
code, which is what every user's custodial wallet is."

The correct primitive is `EthSend`, reached only via `@gl.evm.contract_interface`
(genlayer.py.evm — the actual EVM-bridge decorator), NOT the top-level
`@gl.contract_interface`, which in this pinned SDK build is simply an alias
for `get_contract_at` (verified by runtime introspection: `gl.contract_interface
is get_contract_at` in the loaded module). Fixed by declaring `_PayableRecipient`
with `@gl.evm.contract_interface` and routing all payouts through a single
`_send_gen()` choke point.

**Test suite was blind to this class of bug**: all 33 "passing" tests only
ever asserted the contract's internal `claimable` ledger and `reward_history`
state, never the recipient's actual balance. Added an `_eth_send_hook` to the
gltest.direct VM fixture (the direct-test mock has no built-in EthSend
handler) that credits/debits real mock balances on `EthSend`, and strengthened
`TestClaim` to assert `wallet_balance(vm, SOLVER_A) == balance_before + expected`.
Verified this test is a genuine regression guard: reverting `_send_gen` back
to the `get_contract_at` path makes it fail with `assert 0 == 9500...` while
`claimable` still (wrongly) shows fully settled — exactly reproducing the
production bug. genvm-lint clean, schema still validates (22 methods), all
33 tests pass with the fix in place.

**This is NOT yet deployed.** The currently-live contract (v3,
`0xb5f4C5C4B2162073fc1a0eA7de6EB9E0E9b8037b`) still has the broken transfer —
any `claimable` balance already zeroed there (from prior test claims) is
unrecoverable through the contract (StudioNet test GEN only, no real value).
Needs a fresh redeploy + new address from the user before going live, per
the established workflow.
