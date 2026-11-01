# Reverse Spec Bounties — Submission Notes

## What this is, in plain terms

A bounty board where the person posting the bounty is allowed to be wrong
about what they're asking for — and the person solving it gets paid *more*
for proving it.

On a normal bounty board, you write a spec, someone builds exactly that
spec, you pay them. If they solved the wrong problem, tough — they still
followed the spec, or they get nothing for deviating.

Reverse Spec flips that. A company posts: "improve wallet UX, restyle the
confirmation dialog." A developer instead builds transaction simulation,
because dialogs were never the real problem — users can't tell what a
signature will actually do. Reverse Spec pays that developer in full,
because the deeper problem got solved, not because the literal instructions
got followed.

## The problem it solves

Judging "did this person solve the *real* problem, even though they ignored
what I literally asked for" is not something a normal smart contract can do.
`if (output == expectedOutput)` doesn't work when there is no single
expected output — the whole point is that the best answer might contradict
the spec. And it's not a decision you want one company or one server making
unilaterally either, because that company is the one deciding whether to
pay out its own money.

That's the actual trust problem: someone needs to judge a subjective,
high-stakes claim, and the judge can't be the party with money on the line.
GenLayer's validator consensus is that judge. Independent AI validators
each fetch the solver's evidence themselves and independently score it —
if they don't agree closely enough, the result doesn't finalize. The
verdict is not "an LLM said so," it's "multiple independent parties
verified the same conclusion from the same real evidence."

## What actually happens to the money

This isn't a scoring app that separately tracks who "should" get paid.
Real USDC moves through a Base Sepolia escrow:

1. The creator creates a uniquely referenced bounty shell on GenLayer, then
   approves and deposits USDC into `ReverseSpecEscrow` on Base Sepolia.
2. The standing relayer observes the confirmed deposit and records a non-active
   funding commitment on GenLayer. It then acknowledges the deposit on Base and
   explicitly activates the bounty on GenLayer. Only activation opens the
   bounty for submissions. A mistaken unacknowledged deposit becomes refundable
   after seven days; if that refund wins the race, the relayer voids the
   GenLayer commitment instead of activating an unbacked bounty.
3. A solver submits a rationale plus a link to real, public, checkable work
   (a repo, a doc, a gist).
4. When evaluation runs, GenLayer validators fetch that link themselves and
   grade it — the solver's own description of their work is treated as an
   unverified claim, not evidence. If the link is dead or empty, the
   evidence score is capped low automatically.
5. On finalization, GenLayer computes an 85% winner / 10% runner-up / 5%
   creator allocation. If there is no runner-up, the winner receives 95%.
6. The relayer executes those consensus-derived allocations on Base, and each
   recipient calls `claim()` to receive actual USDC.

The full consensus path was tested on 2026-11-01 without synthetic funding or
settlement identifiers: 5 USDC was deposited, automatically acknowledged,
evaluated, settled, and claimed as 4.75 USDC by the sole winner and 0.25 USDC
by the creator. After the atomic activation upgrade, the current contract pair
separately passed a real 1 USDC commitment, acknowledgement, activation,
cancellation, settlement, and claim smoke. See
[remediation-milestone.md](remediation-milestone.md).

## How to use it

**As a bounty creator:** connect a wallet (MetaMask, Rainbow, or Zerion),
go to "Create Bounty," describe the spec as you understand it, optionally
describe what you suspect the *real* underlying problem is, choose the
submission window, and fund it with Base Sepolia USDC. Funding is bound to the
specific creation reference, not a global bounty counter.

**As a solver:** browse the Explorer, open a bounty, read both the literal
spec and the creator's guess at the deeper problem, then submit your
solution: a title, an explanation of why your approach addresses the root
cause, and a public link to the actual work. You do not need to satisfy the
literal spec — you need to convince independent validators that you solved
the real problem.

**As anyone:** once submissions close, anyone can trigger evaluation and
finalization — the protocol doesn't depend on the creator staying online or
acting in good faith to pay out.

## Repository map

- `contracts/reverse_spec_bounties.py` — production Intelligent Contract
  (lifecycle, submissions, consensus evaluation, payout instructions)
- `contracts/base/ReverseSpecEscrow.sol` — Base Sepolia USDC custody,
  acknowledgment, refund, settlement, and claims
- `backend/` — FastAPI service (wallet auth, search/read cache, chain
  indexer), deployed 24/7 on Fly.io
- `frontend/` — Next.js app (all pages listed below), deployed on Vercel
- `backend/relayer/` — durable Base↔GenLayer funding and payout relay
- `contracts-tests/` — 52 direct Intelligent Contract tests
- `docs/` — architecture, API, contract reference, deployment guide
- `MEMORY.md` — concise current deployment and architecture record

Live: GenLayer contract `0x75B9094aCd67bfC450B07fFA07A63b2446260Eaf`,
Base escrow `0x7e83C2136f9C6e259187E737501086bc84EC0595`, frontend on Vercel, and
replacement backend/relayer apps on Fly.io — see [README.md](README.md).
