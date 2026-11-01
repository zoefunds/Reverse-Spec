# Financial lifecycle remediation milestone

Status: complete and deployed to production on 2026-11-01.

## Acceptance evidence

- Funding replay is acknowledgment-aware. Scanned events and the Base cursor are
  committed atomically, then each pending deposit retries independently until
  `record_funding` and `acknowledgeDeposit` succeed. `fundingRelay.test.js`
  covers interruption/restart and proves a poison event cannot block later ranges.
- Creation identity uses a unique `creation_ref` resolved on GenLayer; the UI
  no longer reads `bounties_total`. `record_funding` enforces funder = creator.
- Base deposits have an explicit lifecycle and deposit id. A funder can call
  `refundUnacknowledged` after seven days if a mistaken/invalid deposit never
  receives the cross-chain acknowledgement. The create UI persists deposit ids
  locally and exposes the safe refund action after relayer timeouts/reloads.
- Validator-side evidence/AI failure rejects the leader result. Direct tests
  cover unavailable evidence and failed independent AI execution.
- The tracked E2E key file is removed and ignored. E2E credentials are injected
  only from a secret manager. `docs/SECURITY-KEY-ROTATION.md` documents wallet
  retirement and full-history removal; these operational steps are mandatory.
- Address defaults and deployment examples use the coordinated production pair:
  GenLayer `0x185cE8fff49fe93f57635aB03FC19B9e5d3D04e6` and Base Sepolia
  `0x8e07D1aE543c489D64E368A579Ac28cF8b541256` (deployment block `52994901`).
- `npm run e2e:payment` is the release-gate test. It uses actual Base Sepolia
  USDC, automatic relaying, real consensus, automatic settlement, and a final
  Base claim; it contains no synthetic funding or settlement identifiers.

## Verification

- 51 GenLayer direct contract tests pass.
- Funding relayer interrupted-acknowledgement regression passes.
- Three Foundry escrow lifecycle tests pass, including reserved-refund isolation
  after another deposit on the same bounty has settled.
- Frontend production build passes.
- `ReverseSpecEscrow.sol` compiles with the pinned local `solcjs`.
- `git diff --check` passes.
- 13 backend API tests and four relayer tests pass.
- The production frontend is live at `https://reverse-spec.vercel.app` and the
  replacement Fly services are `reverse-spec-production-api` and
  `reverse-spec-production-relayer`.

## Live payment-path evidence

- Bounty: `1`; real Base deposit: `5,000,000` USDC units.
- Base funding transaction:
  `0x506953a913f8b420f22f6d0fdc4020f3cc4c828529199699ee3791df04ae3022`.
- GenLayer solver submission:
  `0x8a3a546e7afd09d40cd68b6463b425cbebee47706843ae4e223b82c2d9b85336`.
- Automatic Base settlement:
  `0xa2ad3d0f7f23e6813d4b54b21109d30bb99970847340e96cab562308e12e91fa`.
- Creator claim (`250,000` units):
  `0xc0e708a80dc6347ba7c4ccdcbed5488d1d5bd360a5b6dbd07e0a70d02c36e033`.
- Solver claim (`4,750,000` units):
  `0x5e1f5610d451cbc175c36dc22828e0d67dbf130e987c2971bfa23b5488dbd740`.
- Runner result: `PASS bounty=1 creator_claim=250000 solver_claim=4750000`.

The exposed historical E2E wallets were retired, their remaining balances were
swept, and the tracked credential file was removed from current and rewritten
remote Git history before this deployment.
