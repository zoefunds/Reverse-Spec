# Reverse Spec Bounties — Current Project State

Last synchronized: 2026-11-01.

This file intentionally records only the current production state. Retired
native-GEN deployments and superseded test runs are not operational references.
The completed financial-lifecycle review and transaction evidence live in
[remediation-milestone.md](remediation-milestone.md).

## Product

Reverse Spec Bounties rewards solvers who demonstrate and solve a deeper
problem than the literal specification. GenLayer AI-validator consensus fetches
public evidence independently, evaluates it using a 40/30/20/10 rubric, and
derives deterministic payout instructions. Base Sepolia holds and transfers
the actual USDC.

## Production deployment

| Component | Current production value |
|---|---|
| Frontend | `https://reverse-spec.vercel.app` |
| Fly API | `https://reverse-spec-production-api.fly.dev` |
| Fly API app | `reverse-spec-production-api` (2 machines, `iad`) |
| Fly relayer app | `reverse-spec-production-relayer` (persistent volume, `iad`) |
| Fly standby relayer | `reverse-spec-production-relayer-standby` (persistent volume, `iad`) |
| Fly Postgres | `reverse-spec-production-db` |
| GenLayer StudioNet contract | `0x75B9094aCd67bfC450B07fFA07A63b2446260Eaf` |
| GenLayer deployment tx | `0xff3f9fba5dcbdd9dc53f570032429b386a192b05f05988867bf02609a396b5c5` |
| Base Sepolia escrow | `0x7e83C2136f9C6e259187E737501086bc84EC0595` |
| Escrow deployment block | `53031221` |
| Escrow deployment tx | `0x2d7334ce6c5e834e10d4c52bfe45490942e5e2a0f1f3c41d5474d5e06eab051c` |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Owner/relayer address | `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb` |

## Locked architecture decisions

- The Intelligent Contract is the source of truth for lifecycle, evidence,
  evaluations, ranking, and payout decisions; it holds no funds.
- `ReverseSpecEscrow.sol` is the source of truth for Base Sepolia USDC custody,
  per-deposit acknowledgment/refund state, settlement, and claims.
- The Node relayer is a standing, owner-rotatable bridge. Funding events enter
  an atomic persistent queue before the scan cursor advances. Each deposit
  retries independently across restarts through GenLayer commitment, Base
  acknowledgment, and GenLayer activation. Writes count only after GenLayer
  `FINALIZED` status and successful contract execution; the canonical SDK
  execution result is preferred, with the detailed StudioNet leader receipt as
  a compatibility fallback while that RPC omits the canonical field.
- Relayer writes require a PostgreSQL session advisory lease. The primary and
  standby Fly apps have separate durable replay volumes; only the lease holder
  runs funding/payout loops, and a live failover/failback drill passed.
- Creation uses a unique `creation_ref`; the UI resolves the exact bounty from
  that reference. `record_funding` rejects a funder other than the creator.
- An unacknowledged deposit can be refunded after seven days. Acknowledged
  funds are reserved for consensus-derived settlement and cannot be refunded.
- Validators must complete their own evidence retrieval and AI judgment.
  Infrastructure failure rejects the leader for financially consequential
  decisions.
- The FastAPI/Postgres layer is a rebuildable read model. Transactions are
  signed client-side; the backend never holds user wallet keys.

## Current lifecycle

1. `create_bounty(..., creation_ref)` creates `PENDING_FUNDING`.
2. The creator approves USDC and calls `fund()` on Base.
3. The relayer observes the confirmed `Funded` event and calls
   `record_funding`; the bounty becomes non-active `FUNDING_COMMITTED`.
4. The relayer calls Base `acknowledgeDeposit`, then `activate_funding`; only
   then does the bounty become `OPEN`. A Base refund instead triggers
   `void_funding`, so the refund race cannot leave an active unbacked reward.
5. Solvers submit public evidence. The enforced submission window must expire
   before either creator or solver abandonment-recovery closure can occur.
6. Independent validators evaluate fetched evidence. Eligible results are
   ranked deterministically and finalized with an 85/10/5 allocation; a sole
   eligible winner receives the absent runner-up share (95/5).
7. The relayer reads `get_base_payouts`, calls Base `settle()`, and confirms
   `mark_settled`. Recipients pull USDC with `claim()`.

## Verification baseline

- 52 Intelligent Contract direct tests.
- 13 backend API tests.
- 12 relayer tests, including missing-result, non-final, and failed-execution rejection,
  interrupted acknowledgment replay, poison-event isolation, the seven-day
  refund race, and active/passive leadership gating.
- 4 Foundry escrow lifecycle tests.
- Next.js production build passes.
- Live API health reports database and indexer healthy.
- Live bounty 1 on the current deployment completed the fast real-value smoke:
  1 USDC deposit → commitment → automatic Base acknowledgement → activation →
  cancellation → automatic Base settlement → 1 USDC creator claim.
- Live bounty 2 completed the full current-deployment release gate: 1 USDC
  deposit → automatic activation → solver submission → independent consensus
  evaluation → finalization → automatic Base settlement → exact 0.05 USDC
  creator and 0.95 USDC solver claims. All transaction hashes are recorded in
  `remediation-milestone.md`.

## Security incident closure

The previously tracked E2E key file was removed from the current tree and all
remote Git history. Associated wallets were treated as compromised, swept, and
retired. Current and future E2E credentials are injected at runtime only, and
the full-history secret-scanning workflow prevents reintroduction. Details are
in [docs/SECURITY-KEY-ROTATION.md](docs/SECURITY-KEY-ROTATION.md).
