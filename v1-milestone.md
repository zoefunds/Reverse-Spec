# Split-custody milestone — completed

Status: superseded by the completed financial-lifecycle remediation deployed on
2026-11-01. This document is now a concise migration summary; current evidence
and transaction hashes are in
[remediation-milestone.md](remediation-milestone.md).

## Delivered design

- Replaced native-GEN custody with Base Sepolia USDC custody in
  `ReverseSpecEscrow.sol`.
- Kept subjective evidence retrieval, AI evaluation, tiering, ranking, and
  payout computation on GenLayer.
- Added a standing two-way relayer for confirmed Base funding and
  consensus-derived Base settlement.
- Added enforced submission windows and solver-triggered abandonment recovery.
- Added mandatory evidence availability for paid winners and strict
  independent validator verification.
- Added unique creation references, creator/funder binding, per-deposit
  acknowledgment, and delayed recovery for mistaken unacknowledged deposits.
- Added durable historical event replay and persistent retry state.

## Current production deployment

| Component | Value |
|---|---|
| GenLayer StudioNet contract | `0x75B9094aCd67bfC450B07fFA07A63b2446260Eaf` |
| Base Sepolia escrow | `0x7e83C2136f9C6e259187E737501086bc84EC0595` |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Escrow deployment block | `53031221` |
| Frontend | `https://reverse-spec.vercel.app` |
| API | `https://reverse-spec-production-api.fly.dev` |
| Fly API app | `reverse-spec-production-api` |
| Fly relayer app | `reverse-spec-production-relayer` |
| Fly database | `reverse-spec-production-db` |

## Acceptance result

The full payment-path regression passed on the preceding coordinated pair with
no synthetic funding or settlement identifiers: 5 USDC was deposited on Base,
automatically acknowledged on GenLayer, evaluated by consensus, automatically
settled on Base, and claimed as 4.75 USDC by the sole winner and 0.25 USDC by
the creator. After the atomic activation upgrade, the current pair passed a
real 1 USDC commitment → acknowledgement → activation → cancellation →
settlement → claim smoke. Current and historical transaction evidence is kept
separate in [remediation-milestone.md](remediation-milestone.md).

Verification baseline: 52 contract tests, 13 backend tests, 7 relayer tests, 4
Foundry escrow tests, and a successful frontend production build.
