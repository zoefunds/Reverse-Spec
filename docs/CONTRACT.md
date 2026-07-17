# ReverseSpecBounties — Contract Reference

File: `contracts/reverse_spec_bounties.py` (single production contract,
pinned `py-genlayer` runner, genvm-lint clean, schema-validated: 22 methods).

StudioNet address: `0xbe5E27fF832B229EE584D02b82B4606030d34F40`

## Writes

| Method | Who | Effect |
|---|---|---|
| `create_bounty(title, spec, true_problem, category, tags_csv, created_note, deadline_note)` **payable** | anyone | Escrows `msg.value` GEN, opens bounty |
| `cancel_bounty(id)` | creator | Refund if zero live submissions |
| `close_submissions(id)` | creator | OPEN → EVALUATING |
| `submit_solution(bounty_id, title, rationale, evidence_url)` | solver | Registers solution (https evidence required) |
| `withdraw_submission(id)` | solver | Before evaluation only |
| `evaluate_submission(id)` | anyone | Consensus LLM evaluation w/ live evidence fetch |
| `finalize_bounty(id)` | anyone (all evaluated) | Ranks, pays 85/10/5, or UNRESOLVED |
| `reclaim_escrow(id)` | creator | After UNRESOLVED |
| `claim_rewards()` | recipient | Native GEN transfer of claimable balance |

## Views

`get_bounty`, `get_bounty_page(offset, limit)`, `get_submission`,
`get_bounty_submissions`, `get_evaluation`, `get_claimable(address)`,
`get_solver_stats(address)`, `get_leaderboard(top_n)`,
`get_reward_history(address, limit)`, `get_platform_stats`,
`get_audit_page(offset, limit)`, `check_escrow_invariant`, `get_config`.

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
comparison (±1 tier, ±20 banded points, same-side-of-threshold fallback,
accept-on-own-infra-failure). This is what prevents leader rotation and
UNDETERMINED outcomes without being a rubber stamp.

## Error taxonomy

All reverts are prefixed: `EXPECTED:` (business rule), `EXTERNAL:` (evidence
fetch), `TRANSIENT:` (infra), `LLM_ERROR:` (unusable model output) — via
`gl.vm.UserError`, machine-parseable by clients.
