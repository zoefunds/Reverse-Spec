# ReverseSpecBounties — Contract Reference

File: `contracts/reverse_spec_bounties.py` (single production contract,
pinned `py-genlayer` runner, genvm-lint clean, ~1,646 lines).

Production StudioNet address: `0x185cE8fff49fe93f57635aB03FC19B9e5d3D04e6`.

## Split custody (read this first)

As of v1, this contract **never holds funds**. Funding is USDC (6 decimals)
held in `contracts/base/ReverseSpecEscrow.sol` on Base Sepolia. This
contract judges submissions and decides payouts; a trusted relayer
(`owner`/`relayer` state, rotatable via `set_relayer`) bridges the two
chains by calling `record_funding` (Base deposit confirmed → open the
bounty) and `mark_settled` (Base `settle()` confirmed → close out the
ledger). See [ARCHITECTURE.md](ARCHITECTURE.md) for the full flow.

## Writes

| Method | Who | Effect |
|---|---|---|
| `create_bounty(..., submission_window_secs, creation_ref)` | anyone | Creates a `PENDING_FUNDING` shell. The unique reference resolves through `get_bounty_id_by_creation_ref`, binding this creation transaction to the later deposit without a global counter. |
| `record_funding(bounty_id, funder, amount, base_tx_hash)` | relayer only | Idempotently confirms a Base deposit and rejects any funder other than the bounty creator. Opens the bounty once the minimum is met. |
| `cancel_bounty(id)` | creator | Refund if zero live submissions (works from `PENDING_FUNDING` or `OPEN`) |
| `close_submissions(id)` | creator, or any solver with a live submission | OPEN → EVALUATING (abandonment recovery); reverts until `submission_deadline` has elapsed, for both paths |
| `submit_solution(bounty_id, title, rationale, evidence_url)` | solver | Registers solution (https evidence required) |
| `withdraw_submission(id)` | solver | Before evaluation only |
| `evaluate_submission(id)` | anyone | Consensus LLM evaluation w/ live evidence fetch |
| `finalize_bounty(id)` | anyone (all evaluated) | Ranks, pays 85/10/5, or UNRESOLVED — only submissions with `evidence_fetch_ok == True` are eligible to win/place |
| `reclaim_escrow(id)` | creator | After UNRESOLVED |
| `mark_settled(bounty_id, base_tx_hash)` | relayer only | Confirms a Base Sepolia `settle()` call; idempotent on `base_tx_hash` |
| `set_relayer(new_relayer)` | owner only | Rotates the trusted relayer address |

`claim_rewards()` has been **removed** — recipients now claim in USDC
directly on Base Sepolia via `ReverseSpecEscrow.claim(bountyId)`, not on
GenLayer.

## Views

`get_bounty`, `get_bounty_page(offset, limit)`, `get_submission`,
`get_bounty_submissions`, `get_evaluation`, `get_claimable(address)`,
`get_solver_stats(address)`, `get_leaderboard(top_n)`,
`get_reward_history(address, limit)`, `get_platform_stats`,
`get_audit_page(offset, limit)`, `check_escrow_invariant`, `get_config`,
`get_base_payouts(bounty_id)` (new — unsettled `[{recipient, amount}]`
allocations for the relayer to settle on Base Sepolia).

`check_escrow_invariant` no longer checks a real balance (the contract
holds no funds): it returns `tracked_open_escrow` / `summed_bounty_escrow`
(must be equal) instead of `contract_balance`/`obligations`.

`get_config` gained: `funding_currency` ("USDC"), `usdc_decimals` (6),
`min_submission_window_secs`, `max_submission_window_secs`, `relayer`.

## Evaluation rubric (stored on-chain per submission)

- `problem_depth` 40% · `superiority` 30% · `evidence_quality` 20% ·
  `spec_compliance` 10% → `composite`
- Tier: `OFF_TOPIC | SPEC_ONLY | PARTIAL_DEPTH | DEEP_SOLUTION | REDEFINING`
- Win: composite ≥ 55 **and** tier ≥ PARTIAL_DEPTH; runner-up ≥ 45.
- Verdict includes model reasoning + a verbatim excerpt of the *fetched*
  evidence, making every decision explainable and auditable forever.

## Consensus design

Custom `gl.vm.run_nondet(derive, validator_fn)` where `derive` fetches the
evidence (`gl.nondet.web.render`) and judges (`gl.nondet.exec_prompt`), and
`validator_fn` = deterministic structural checks + tolerant semantic
comparison (±1 tier, ±12 banded points — tightened from ±20, and the older
same-side-of-threshold fallback was removed so agreement is strictly
tier-gap ≤1 **and** score-gap ≤12 — plus an exact `evidence_fetch_ok` match
between leader and validator). Independent fetch/AI failure rejects the
leader result: infrastructure failure is never treated as financial agreement.

## Error taxonomy

All reverts are prefixed: `EXPECTED:` (business rule), `EXTERNAL:` (evidence
fetch), `TRANSIENT:` (infra), `LLM_ERROR:` (unusable model output) — via
`gl.vm.UserError`, machine-parseable by clients.
