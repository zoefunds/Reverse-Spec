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
| GenLayer StudioNet contract | `0x185cE8fff49fe93f57635aB03FC19B9e5d3D04e6` |
| Base Sepolia escrow | `0x8e07D1aE543c489D64E368A579Ac28cF8b541256` |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Escrow deployment block | `52994901` |
| Frontend | `https://reverse-spec.vercel.app` |
| API | `https://reverse-spec-production-api.fly.dev` |
| Fly API app | `reverse-spec-production-api` |
| Fly relayer app | `reverse-spec-production-relayer` |
| Fly database | `reverse-spec-production-db` |

## Acceptance result

The real production payment-path regression passed with no synthetic funding or
settlement identifiers: 5 USDC was deposited on Base, automatically
acknowledged on GenLayer, evaluated by consensus, automatically settled on
Base, and claimed as 4.75 USDC by the sole winner and 0.25 USDC by the creator.

Verification baseline: 51 contract tests, 13 backend tests, 4 relayer tests, 3
Foundry escrow tests, and a successful frontend production build.
