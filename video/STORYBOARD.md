# STORYBOARD — ReverseSpec master film (90 s, 30 fps, 1920×1080)

Shared motion vocabulary: entrance 400 ms ease-out; exit 300 ms; camera push ≤ 4%; transitions limited to {directional wipe, focus-blur resolve, mask-through-panel, state-flash}. Sound layers: VO / music bed / UI-tick SFX.

---

**Scene 1 — Hook: the wrong spec** · frames 0–135 (0.0–4.5 s)
Purpose: pattern-breaking tension before any explanation.
VO: "Every bounty starts with a spec. And sometimes — the spec is wrong."
On-screen: mono spec text types in ("implement a dynamic slippage-tolerance widget…"), then a hard strikethrough sweeps it; headline **"The spec was wrong."**
Visuals: KineticText on brand background, purple spec-marker bar.
Real asset: real spec text from bounty #1. Remotion: type-on + strike wipe. Pexo: none.
Transition in: cold open. Out: strike line continues into scene 2 as a divider.
Sound: low tension pad; single tick on strike. Proof: real spec text. Takeaway: specs can be the wrong target.

**Scene 2 — The trust problem** · 135–450 (4.5–15 s)
Purpose: why this can't be judged by `A == B` or by a company.
VO: "Traditional bounties pay for compliance. Build the widget, tick the boxes, collect the reward. But the developer who finds the real problem behind the spec? No server, no company, can fairly judge that claim."
On-screen: "compliance ≠ solved" → "who judges the better answer?"
Visuals: two EvidenceCards — WHAT WAS ASKED vs WHAT GOT REWARDED (real landing "inversion" copy) — then both dim under the question.
Real asset: landing-page inversion copy. Remotion: card slide-ins, dim. Pexo: none.
In: divider line. Out: focus-blur resolve into the reveal.
Sound: tension builds. Proof: n/a (problem framing). Takeaway: subjective verdicts need a new trust layer.

**Scene 3 — Reveal** · 450–660 (15–22 s)
Purpose: name lands as the answer.
VO: "ReverseSpec inverts the bounty. The spec is a hypothesis. The deeper problem is the prize."
On-screen: logo mark + **ReverseSpec** (1.5 s hero hold) → real landing hero screenshot pushes in behind ("Solve the better problem.").
Real asset: `screens/landing.png`. Remotion: type reveal, BrowserFrame push-in. Pexo: none.
In: blur resolve. Out: mask through the landing hero panel.
Sound: music lift + reveal hit. Proof: live product visible. Takeaway: the product name and its one idea.

**Scene 4 — Product flow** · 660–1200 (22–40 s)
Purpose: what the user actually does.
VO: "A creator escrows real GEN into an Intelligent Contract, alongside the literal spec. Solvers respond with a rationale — and a public evidence artifact. Ignoring the spec is allowed. If the root cause gets solved."
On-screen: "fund the problem" → "escrowed: 63,000 GEN (live)" → "evidence, not prose".
Visuals: BrowserFrame sequence — explorer grid pan → bounty #1 detail (ORIGINAL SPEC vs DEEPER PROBLEM crop) → submission card with EVIDENCE link crop; FocusZoom on payout structure 85/10/5.
Real asset: `explorer.png`, `bounty-1-full.png`, `create.png`. Remotion: pans, crops, cursor pulse. Pexo: none.
In: mask. Out: track the EVIDENCE link into the architecture scene.
Sound: momentum; soft ticks per beat. Proof: real UI, live escrow number. Takeaway: escrow + evidence-first submissions.

**Scene 5 — Mechanism (causal flow)** · 1200–1740 (40–58 s)
Purpose: what happens behind the interface; why GenLayer is essential.
VO: "Here's what makes it trustless. GenLayer's AI validators fetch each artifact themselves — inside consensus. They judge depth, superiority, and evidence quality, and agree on a verdict no single party controls."
On-screen: plain-language labels: "submission → contract call → validators fetch the evidence → independent judgment → consensus verdict"; StateMachine strip SUBMITTED → EVIDENCE FETCHED → VALIDATED → RESOLVED.
Visuals: ArchitectureFlow — nodes revealed only when relevant, directional line travels; ConsensusVisual: 5 validator dots converge on a verdict chip.
Real asset: concepts match contract behaviour (truth-map row 2–3). Remotion: all of it. Pexo: none.
In: tracked line. Out: state-flash on RESOLVED.
Sound: confident synth; line-connect SFX; consensus chord. Proof: mechanism mirrors real contract. Takeaway: evidence is judged inside consensus.

**Scene 6 — Proof / receipt** · 1740–2160 (58–72 s)
Purpose: show it is real, with numbers.
VO: "This is a real verdict, on-chain today. Deep solution — depth ninety-one. Forty-seven and a half thousand GEN paid out of the contract, and a conservation invariant anyone can query."
On-screen: "verdict: DEEP_SOLUTION · composite 78 · depth 91" → "47,500 GEN paid" → "invariant: healthy".
Visuals: FocusZoom into real bounty-1 verdict ring; TransactionReceipt card (winner 85% / runner-up 10% / creator 5%); MetricReveal of live invariant equation; small evidence chip "27 contract tests · 12 API tests · CI".
Real asset: `bounty-1.png` verdict crop; live `/stats` JSON values. Remotion: counters, receipt. Pexo: none.
In: state-flash. Out: pull-back wipe.
Sound: resolution begins; single reveal hit on 47,500. Proof: the core section. Takeaway: money actually moved, verifiably.

**Scene 7 — Status + ecosystem** · 2160–2520 (72–84 s)
Purpose: honest stage + GenLayer relationship.
VO: "It runs live on GenLayer StudioNet — a deployed contract, a twenty-four-seven indexer, and a working claim path — designed to become native to mainnet."
On-screen: "live on GenLayer StudioNet" · contract `0x79F6…D2C4` · "24/7 indexer" · "designed for mainnet".
Visuals: pull-back from UI into compact 3-node deploy map (Vercel / Fly / StudioNet contract) with rewards page screenshot at right.
Real asset: `rewards.png`, real address, live URLs. Remotion: map + labels. Pexo: none.
In: pull-back. Out: dim to close.
Sound: settling. Proof: deploy surface + address. Takeaway: real deployment, honestly scoped.

**Scene 8 — Close** · 2520–2700 (84–90 s)
Purpose: one memorable belief + end card.
VO: "The spec is a hypothesis. Pay for the truth."
On-screen: **"The spec is a hypothesis. Pay for the truth."** → EndCard: ReverseSpec · "Solve the better problem." · Live on GenLayer StudioNet · reverse-spec.vercel.app.
Visuals: typography only; logo mark; SafeArea-clean.
Remotion: KineticText + EndCard. Pexo: none.
In: dim. Out: hold last 20 frames.
Sound: final note, then silence tail. Proof: URL. Takeaway: the belief + where to go.

---
Vertical (9:16) and square (1:1): same scene order and audio; UI crops re-framed to single-column, headlines enlarged, captions moved into lower-third safe area, architecture flow re-laid vertically. Recomposed, not cropped.
