# Financial lifecycle remediation milestone

Status: implementation complete; coordinated redeployment and live E2E remain
operational release gates.

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
- Address defaults and deployment examples use one v1 pair. Because this
  milestone changes both contracts, release requires new coordinated addresses
  to replace that pair everywhere before production traffic is enabled.
- `npm run e2e:payment` is the release-gate test. It uses actual Base Sepolia
  USDC, automatic relaying, real consensus, automatic settlement, and a final
  Base claim; it contains no synthetic funding or settlement identifiers.

## Verified locally

- 51 GenLayer direct contract tests pass.
- Funding relayer interrupted-acknowledgement regression passes.
- Three Foundry escrow lifecycle tests pass, including reserved-refund isolation
  after another deposit on the same bounty has settled.
- Frontend production build passes.
- `ReverseSpecEscrow.sol` compiles with the pinned local `solcjs`.
- `git diff --check` passes.

## Release gates

1. Rotate/retire all wallets exposed by historical E2E credentials and purge
   the file from remote Git history.
2. Deploy the revised Base escrow and GenLayer contract from the replacement
   relayer identity.
3. Update every address in the documented configuration surfaces and set the
   funding replay start block to the new escrow deployment block.
4. Run the real payment-path E2E and retain its Base/GenLayer transaction hashes
   as release evidence.
