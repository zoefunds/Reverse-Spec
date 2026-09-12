# Roadmap

This is a working protocol, not a demo shell — proven live moving real GEN
through the original native-currency design, and now rewritten (v1) to a
split-custody model where a Base Sepolia Solidity escrow holds real USDC
and GenLayer judges and instructs payouts. What's next, roughly in order:

## Near-term (protocol hardening)

- **Relayer decentralization / liveness.** The v1 split-custody design
  depends on a single trusted relayer address to bridge Base Sepolia
  funding/settlement events into GenLayer (`record_funding`,
  `mark_settled`) and back (`get_base_payouts` → `settle()`). It's
  owner-rotatable (`set_relayer`) but still a single point of liveness
  failure; multi-relayer or watchtower redundancy is the natural next
  hardening step now that funds live off GenLayer entirely.
- **Dispute window.** Currently `finalize_bounty` is final once validators
  agree. A short challenge period where a rejected solver can request
  re-evaluation with additional evidence would reduce the cost of a bad
  first submission and make the protocol friendlier to iterate against.
- **Partial-evidence bounties.** Right now evidence must be a single public
  URL. Real submissions often span a repo, a deployed demo, and a design
  doc — supporting multiple evidence artifacts per submission (each fetched
  and weighed independently) would match how solvers actually work.
- **Configurable evaluation weighting.** The 40/30/20/10 rubric weighting
  (depth/superiority/evidence/compliance) is currently a protocol constant.
  Letting a creator pick a preset (e.g. "compliance-heavy" vs
  "depth-heavy") per bounty widens who the protocol serves without
  changing the trust model.

## Adoption path

- **Bridge from existing bounty platforms.** The biggest cold-start problem
  for any bounty board is supply of real bounties. A lightweight importer
  that lets a company post their existing (traditional) bounty spec and
  opt into Reverse Spec evaluation — rather than requiring migration — is
  the realistic on-ramp.
- **Reputation portability.** `get_solver_stats` and the leaderboard already
  track depth-score history on-chain. Exposing this as a signed,
  exportable credential (an address's proven track record of solving root
  causes, not just tickets) is valuable to solvers independent of whether
  they keep using this specific frontend.
- **Org accounts.** Today every bounty creator is a single wallet. Real
  companies bounty-hunting will want multi-signer funding and role-based
  visibility (finance funds, engineering evaluates) before this is
  something a company's procurement process can actually approve.

## Why this is worth continuing

The mechanism only gets more useful as it accumulates history: every
resolved bounty is a permanent, on-chain, evidence-backed case study of
"the spec was wrong, here's what was actually needed, here's why
independent validators agreed." That corpus is itself valuable — to
solvers building reputation, to companies learning what they habitually
under-specify, and to anyone studying how GenLayer consensus performs on
open-ended technical judgment calls. None of that requires a new contract
or a redesign — it's the natural byproduct of the protocol being used.
