# Financial lifecycle remediation milestone

Status: complete and deployed to production on 2026-11-01.

## Acceptance evidence

- Funding replay is acknowledgment-aware. Scanned events and the Base cursor are
  committed atomically, then each pending deposit retries independently through
  `record_funding` (non-active commitment), `acknowledgeDeposit` on Base, and
  `activate_funding` on GenLayer. `fundingRelay.test.js` covers
  interruption/restart and proves a poison event cannot block later ranges.
- GenLayer `ACCEPTED` is not treated as application success. The relayer requires
  a successful leader execution receipt and keeps failed executions queued.
- The seven-day refund race is safe: before Base acknowledgement the bounty is
  only `FUNDING_COMMITTED`; a successful refund triggers `void_funding`. If
  acknowledgement wins, the deposit is non-refundable and activation retries
  durably. No ordering can create an active unbacked reward.
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
  retirement and completed full-history removal.
- Address defaults and deployment examples use the coordinated production pair:
  GenLayer `0x75B9094aCd67bfC450B07fFA07A63b2446260Eaf` and Base Sepolia
  `0x7e83C2136f9C6e259187E737501086bc84EC0595` (deployment block `53031221`).
- The current GenLayer deployment transaction is
  `0xff3f9fba5dcbdd9dc53f570032429b386a192b05f05988867bf02609a396b5c5`;
  the current Base escrow deployment transaction is
  `0x2d7334ce6c5e834e10d4c52bfe45490942e5e2a0f1f3c41d5474d5e06eab051c`.
- `npm run e2e:payment` is the release-gate test. It uses actual Base Sepolia
  USDC, automatic relaying, real consensus, automatic settlement, and a final
  Base claim; it contains no synthetic funding or settlement identifiers.

## Verification

- 52 GenLayer direct contract tests pass.
- Funding relayer interrupted-acknowledgement regression passes.
- Four Foundry escrow lifecycle tests pass, including pending acknowledgement
  remaining refundable after seven days and reserved-refund isolation
  after another deposit on the same bounty has settled.
- Frontend production build passes.
- `ReverseSpecEscrow.sol` compiles with the pinned local `solcjs`.
- `git diff --check` passes.
- 13 backend API tests and seven relayer tests pass.
- The production frontend is live at `https://reverse-spec.vercel.app` and the
  replacement Fly services are `reverse-spec-production-api` and
  `reverse-spec-production-relayer`.

## Current deployment funding smoke

The current coordinated pair completed a real 1 USDC lifecycle on bounty `1`:
creation → Base deposit → automatic commitment/acknowledgement/activation →
cancellation → automatic Base settlement → claim.

- GenLayer creation: `0x148eb7ff76fdc42a63a0fda9684f282985cee2d978aeb99f712635e3853050a0`.
- Base funding: `0x480405ffd072347cb2669342fe143fe4ac056652d4bcf2c5019aa964d09f9026`.
- GenLayer cancellation: `0x49d4b0d3def30feafd7d3bbce15a9721916e751ee99381b2d008676aabb41d00`.
- Automatic Base settlement:
  `0x1fa09a7f2051cd39838f8db106c4ac327c0cd9af64b1782d5c0d0e7d851c46ba`.
- Base claim (`1,000,000` units):
  `0x2e1ce4c01742af6c479a04359d35d961bfdcb72e29bc7bed7e3b0c6ae1787e40`.
- Runner result: `PASS bounty=1 deposit=1 claimed=1000000`.

## Historical full payment-path evidence

The following full consensus run was completed on the immediately preceding,
now-retired contract pair before the atomic activation upgrade. It remains
evidence for the real evaluation and 85/10/5 settlement path, not a current
deployment address reference.

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
