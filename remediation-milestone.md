# Financial lifecycle remediation milestone

Status: complete and deployed to production on 2026-11-01.

## Acceptance evidence

- Funding replay is acknowledgment-aware. Scanned events and the Base cursor are
  committed atomically, then each pending deposit retries independently through
  `record_funding` (non-active commitment), `acknowledgeDeposit` on Base, and
  `activate_funding` on GenLayer. `fundingRelay.test.js` covers
  interruption/restart and proves a poison event cannot block later ranges.
- GenLayer writes count only after `FINALIZED` and successful contract
  execution. The relayer prefers the SDK's canonical execution-result field,
  uses StudioNet's detailed leader receipt only as a compatibility fallback,
  and keeps non-final or failed executions queued.
- Two independently hosted Fly relayer apps use separate encrypted replay
  volumes and a shared PostgreSQL session advisory lease. Only one submits
  writes; a live primary-stop → standby-takeover → primary-failback drill
  verified automatic process redundancy.
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
- 13 backend API tests and 12 relayer tests pass. Relayer coverage includes
  interrupted acknowledgement replay, poison-event isolation, finality and
  execution failure, the refund race, and active/passive leadership gating.
- The production frontend is live at `https://reverse-spec.vercel.app` and the
  replacement Fly services are `reverse-spec-production-api`,
  `reverse-spec-production-relayer`, and
  `reverse-spec-production-relayer-standby`.
- Production relayers wait five Base Sepolia confirmations for funding,
  acknowledgement, and settlement transactions.

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

## Current deployment full payment path

Bounty `2` completed the full release gate on the current production pair with
`1,000,000` USDC units. Funding was automatically committed, acknowledged, and
activated; the solver submission was independently evaluated; the sole winner
received 95% and the creator 5%; the relayer settled Base; and both recipients
claimed the exact allocated balances.

- GenLayer creation:
  `0xae7feb41a2ea80865aeb47a431384047bcc4f71e2e25179cecd05d251e4c2584`.
- Base USDC approval:
  `0x5215e52b2dc9544b23105a4dc613a08ceb95817dec2a63ce467747f4b73f98e2`.
- Base funding (deposit `2`):
  `0x331e7cf320ab8b1c3c9748ed5572696fa5561ec671714be18fca61fac3cdcb65`.
- GenLayer funding commitment:
  `0x220e0cb5c03b6d16fb878abb2d8463fc7aa0babab37ed94403d5c4ac51a83756`.
- GenLayer activation:
  `0xac91b3c14af7139e3465e29d6c5f0c06817fd7482354fe820755b354cab710b1`.
- GenLayer solver submission:
  `0x6987e9285a65010c81261b6821500d627d826f4f9a617de039cb68bd58339d6a`.
- GenLayer submission close:
  `0x7344c3f66ed18771b8ace6c974f8b06fe395b57c2e37bc97a36c375955983f59`.
- GenLayer consensus evaluation:
  `0xb910b33cf5a057fafd1d341dbb2470cf91a80d67c6b29c1f6aec7787c8659088`.
- GenLayer finalization:
  `0xf817fe70aaf319afc8026c85a3f580a70cf14c1cf8d0166bcfd0361e91b2b9f6`.
- Automatic Base settlement:
  `0x8ef3ec1a76065de714f0f711542436db7921e6ab81a051d87544243840f1b4f2`.
- Creator claim (`50,000` units):
  `0xdf1dfa62aa76e70ede78dd3a072c988b6700bed83eb6019635d715bfc6c10b55`.
- Solver claim (`950,000` units):
  `0x282c817e7319763f3e42ebd1610f6396cb1b3ec17a95d32e12706f4462c654d3`.
- GenLayer settlement acknowledgement:
  `0xf1ee14fbae2c3e5a9f840e9fdaf0747719aef48eff87c00d4391d45ed8cafa57`.

The first runner invocation completed every financial action but its final
evidence lookup hit Base's 200-block `eth_getLogs` cap. The release runner now
queries settlement logs in bounded chunks, and `npm run e2e:evidence` provides
read-only chunked recovery. The on-chain event record above proves settlement
and both claims completed before that reporting-only error.

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
