/** How it works — protocol mechanics, trust model, FAQ. Static page. */

import { Card, DiffPane, Tag } from "@/components/ui";

export const metadata = { title: "How it works — ReverseSpec" };

const FAQ = [
  {
    q: "Why does this need a blockchain at all?",
    a: "The verdict “you solved a better problem than the spec asked for” moves real money on subjective grounds. A single company deciding that is just a jury of one. GenLayer replaces that with a committee of independent AI validators that must reach consensus — and the escrow itself lives in the contract, so nobody can decide differently from what consensus concluded.",
  },
  {
    q: "Can I win with a great write-up and no real work?",
    a: "No. Validators fetch your evidence URL themselves, inside consensus, and judge the fetched content. Your rationale is treated as claims; the artifact is what gets verified. Unfetchable or hollow evidence caps your evidence score.",
  },
  {
    q: "What exactly happens to the escrow?",
    a: "Funding happens in two steps: you create the bounty on GenLayer, then deposit USDC into the Base Sepolia escrow contract; a relayer confirms the deposit and opens the bounty. On finalization, 85% is allocated to the winner, 10% to the runner-up (or to the winner if none), 5% back to the creator. Allocations are claimed with a real USDC transfer straight from the escrow. If nothing meets the bar, the creator reclaims everything.",
  },
  {
    q: "How are evaluation disagreements handled?",
    a: "Scores are banded and validators accept any leader verdict within one tier and a fixed score tolerance of their own independent judgment — strict enough to stop nonsense, loose enough that model variance never deadlocks consensus.",
  },
  {
    q: "Who can trigger evaluation and finalization?",
    a: "Anyone, once submissions are closed. The protocol is permissionless past that point, so a stalled creator can't strand solvers.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <header>
        <h1 className="font-head text-h1 text-ink">How ReverseSpec works</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">
          A bounty protocol where the specification is a starting hypothesis,
          not a contract. The deliverable is proof that you solved the problem
          behind the problem.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-head text-h2 text-ink">The core inversion</h2>
        <DiffPane
          leftTitle="TRADITIONAL BOUNTY"
          rightTitle="REVERSE SPEC"
          left={
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>Spec is the contract</li>
              <li>Compliance is verified</li>
              <li>Deviation is failure</li>
              <li>A human picks the winner</li>
            </ul>
          }
          right={
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>Spec is a hypothesis</li>
              <li>Root-cause impact is verified</li>
              <li>Justified deviation can win MORE</li>
              <li>Validator consensus picks the winner</li>
            </ul>
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-head text-h2 text-ink">The evaluation rubric</h2>
        <Card>
          <div className="flex flex-col gap-3 font-mono text-sm">
            {[
              ["problem_depth", "40%", "Did the work identify and address the true root cause?"],
              ["superiority", "30%", "Is the delivered approach objectively better than what was asked?"],
              ["evidence_quality", "20%", "Does the fetched artifact substantiate the claims with real work?"],
              ["spec_compliance", "10%", "Did it also satisfy the literal spec? (Worth the least — on purpose.)"],
            ].map(([k, w, d]) => (
              <div key={k} className="flex flex-col gap-0.5 border-b border-line-soft pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-primary">{k}</span>
                  <Tag>{w}</Tag>
                </div>
                <span className="font-body text-sm text-ink-soft">{d}</span>
              </div>
            ))}
          </div>
        </Card>
        <p className="text-sm text-ink-soft">
          Verdict tiers: <span className="font-mono text-tag">OFF_TOPIC → SPEC_ONLY → PARTIAL_DEPTH → DEEP_SOLUTION → REDEFINING</span>.
          Winning requires composite ≥ 55 and at least PARTIAL_DEPTH.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-head text-h2 text-ink">FAQ</h2>
        {FAQ.map((item) => (
          <Card key={item.q}>
            <h3 className="mb-1.5 font-head text-h3 text-ink">{item.q}</h3>
            <p className="text-sm leading-relaxed text-ink-soft">{item.a}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
