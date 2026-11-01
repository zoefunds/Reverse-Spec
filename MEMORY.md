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
| Fly Postgres | `reverse-spec-production-db` |
| GenLayer StudioNet contract | `0x185cE8fff49fe93f57635aB03FC19B9e5d3D04e6` |
| Base Sepolia escrow | `0x8e07D1aE543c489D64E368A579Ac28cF8b541256` |
| Escrow deployment block | `52994901` |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Owner/relayer address | `0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb` |

## Locked architecture decisions

- The Intelligent Contract is the source of truth for lifecycle, evidence,
  evaluations, ranking, and payout decisions; it holds no funds.
- `ReverseSpecEscrow.sol` is the source of truth for Base Sepolia USDC custody,
  per-deposit acknowledgment/refund state, settlement, and claims.
- The Node relayer is a standing, owner-rotatable bridge. Funding events enter
  an atomic persistent queue before the scan cursor advances. Each deposit
  retries independently across restarts until both GenLayer recording and Base
  acknowledgment succeed.
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
3. The relayer observes the confirmed `Funded` event, calls `record_funding`,
   and then `acknowledgeDeposit`; the bounty becomes `OPEN`.
4. Solvers submit public evidence. The enforced submission window must expire
   before either creator or solver abandonment-recovery closure can occur.
5. Independent validators evaluate fetched evidence. Eligible results are
   ranked deterministically and finalized with an 85/10/5 allocation; a sole
   eligible winner receives the absent runner-up share (95/5).
6. The relayer reads `get_base_payouts`, calls Base `settle()`, and confirms
   `mark_settled`. Recipients pull USDC with `claim()`.

## Verification baseline

- 51 Intelligent Contract direct tests.
- 13 backend API tests.
- 4 relayer tests, including interrupted acknowledgment replay, poison-event
  isolation, private-key normalization, and nested GenLayer result
  normalization for payout discovery.
- 3 Foundry escrow lifecycle tests.
- Next.js production build passes.
- Live API health reports database and indexer healthy.
- Live bounty 1 completed the full real payment path on 2026-11-01:
  5 USDC deposit → automatic acknowledgment → consensus → automatic Base
  settlement → 4.75 USDC winner claim + 0.25 USDC creator claim.

## Security incident closure

The previously tracked E2E key file was removed from the current tree and all
remote Git history. Associated wallets were treated as compromised, swept, and
retired. Current and future E2E credentials are injected at runtime only, and
the full-history secret-scanning workflow prevents reintroduction. Details are
in [docs/SECURITY-KEY-ROTATION.md](docs/SECURITY-KEY-ROTATION.md).
