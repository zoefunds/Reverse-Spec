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
Real GEN moves:

1. A creator funds a bounty — GEN leaves their wallet and sits in the
   contract's escrow the moment the transaction confirms.
2. A solver submits a rationale plus a link to real, public, checkable work
   (a repo, a doc, a gist).
3. When evaluation runs, GenLayer validators fetch that link themselves and
   grade it — the solver's own description of their work is treated as an
   unverified claim, not evidence. If the link is dead or empty, the
   evidence score is capped low automatically.
4. On finalization, the contract splits the escrow — 85% winner, 10%
   runner-up, 5% back to the creator — and credits each address.
5. Claiming triggers an actual on-chain transfer out of the contract into
   the recipient's wallet.

We tested this for real on GenLayer StudioNet, not with mocks: four funded
bounties between 10,000 and 50,000 GEN each, real submissions with real
evidence URLs, a real consensus evaluation that fetched a linked repo and
returned a written verdict, and a real payout of 47,500 GEN that a wallet
then claimed and received.

## How to use it

**As a bounty creator:** connect a wallet (MetaMask, Rainbow, or Zerion),
go to "Create Bounty," describe the spec as you understand it, optionally
describe what you suspect the *real* underlying problem is, and fund it
with GEN. The GEN is now in escrow — you no longer control it directly.

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

- `contracts/reverse_spec_bounties.py` — the one production Intelligent
  Contract (escrow, submissions, consensus evaluation, payouts)
- `backend/` — FastAPI service (wallet auth, search/read cache, chain
  indexer), deployed 24/7 on Fly.io
- `frontend/` — Next.js app (all pages listed below), deployed on Vercel
- `contracts-tests/` — 29 direct tests + integration smoke tests against
  the live deployed contract
- `docs/` — architecture, API, contract reference, deployment guide
- `MEMORY.md` — running log of every decision and every on-chain test run

Live: contract `0x1DD671F0b8Be9e6fB7e7F2078261e1B840AF4439` on StudioNet,
frontend on Vercel, backend on Fly.io — see [README.md](README.md) for URLs.
