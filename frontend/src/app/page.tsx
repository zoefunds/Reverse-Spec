"use client";

/** Landing page — pitch, how it works, live protocol stats. */

import { useEffect, useState } from "react";

import { DiffPane, StatCard } from "@/components/ui";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { readContract } from "@/lib/chain";
import { formatUsdc } from "@/lib/format";

interface PlatformStats {
  bounties_total: number;
  bounties_open: number;
  bounties_resolved: number;
  submissions_total: number;
  open_escrow: string;
  total_paid_out: string;
  solvers_total: number;
}

const STEPS = [
  {
    n: "01",
    title: "Fund the problem",
    body: "A creator creates the bounty on GenLayer with the literal spec — and optionally their guess at the deeper problem — then funds it with USDC on a Base Sepolia escrow.",
  },
  {
    n: "02",
    title: "Solve what actually matters",
    body: "Solvers submit a rationale plus a public evidence artifact. Ignoring the literal spec is allowed — if the root cause gets solved.",
  },
  {
    n: "03",
    title: "Validators judge the evidence",
    body: "GenLayer's AI validators independently fetch your artifact and reach consensus on depth, superiority, and evidence quality.",
  },
  {
    n: "04",
    title: "Value moves on-chain",
    body: "85% of escrow to the winner, 10% to the runner-up, 5% back to the creator. Claims are real USDC transfers straight from the Base Sepolia escrow.",
  },
];

export default function LandingPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  useEffect(() => {
    // Indexer snapshot first (fast, reliable); direct chain read as fallback.
    api.stats()
      .then((s) => {
        if (s.platform) setStats(s.platform as unknown as PlatformStats);
        else throw new Error("no snapshot yet");
      })
      .catch(() =>
        readContract<PlatformStats>("get_platform_stats")
          .then(setStats)
          .catch(() => setStats(null)));
  }, []);

  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-xl border border-line-soft bg-surface-lowest px-6 py-16 text-center md:py-20">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-strong/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-secondary-strong/10 blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-tag text-tertiary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" />
            LIVE ON GENLAYER STUDIONET
          </span>
          <h1 className="mb-4 font-head text-display text-ink">
            Solve the{" "}
            <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">
              better problem.
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl leading-relaxed text-ink-soft">
            Traditional bounties reward compliance with a spec. ReverseSpec
            rewards the developer who discovers the deeper problem behind it —
            and proves they solved it. Verdicts and payouts are decided by
            GenLayer validator consensus, not by us.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/explorer">Explore bounties →</Button>
            <Button href="/how-it-works" variant="ghost">How it works</Button>
          </div>
        </div>
      </section>

      {/* The inversion, illustrated */}
      <section className="mx-auto w-full max-w-3xl">
        <h2 className="mb-4 text-center font-head text-h2 text-ink">
          The inversion
        </h2>
        <DiffPane
          leftTitle="WHAT WAS ASKED"
          rightTitle="WHAT GOT REWARDED"
          left={<p>&ldquo;Improve wallet UX. Restyle the confirmation dialog with clearer warnings.&rdquo;</p>}
          right={<p>&ldquo;Dialogs were never the problem. The solver built transaction simulation — users finally see what a signature will do. Verdict: REDEFINING, paid in full.&rdquo;</p>}
        />
      </section>

      {/* Steps */}
      <section>
        <h2 className="mb-6 text-center font-head text-h2 text-ink">
          How value flows
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n}
              className="rounded-lg border border-line-soft bg-surface-mid p-5 transition-colors hover:border-primary-strong/40">
              <span className="font-mono text-tag text-primary">{s.n}</span>
              <h3 className="mb-1.5 mt-2 font-head text-h3 text-ink">{s.title}</h3>
              <p className="text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live protocol stats (on-chain reads) */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open bounties" accent="text-primary"
          value={stats ? stats.bounties_open : "—"} />
        <StatCard label="Escrow live" accent="text-tertiary"
          value={stats ? `${formatUsdc(stats.open_escrow)} USDC` : "—"} />
        <StatCard label="Paid to solvers" accent="text-success"
          value={stats ? `${formatUsdc(stats.total_paid_out)} USDC` : "—"} />
        <StatCard label="Solvers" accent="text-secondary"
          value={stats ? stats.solvers_total : "—"} />
      </section>

      {/* CTA */}
      <section className="rounded-xl border border-line-soft bg-primary-strong/5 px-6 py-12 text-center">
        <h2 className="mb-3 font-head text-h1 text-ink">
          Ready to rewrite the specification?
        </h2>
        <p className="mx-auto mb-6 max-w-lg text-ink-soft">
          Post a problem worth solving, or claim one by proving the spec was
          asking the wrong question.
        </p>
        <div className="flex justify-center gap-3">
          <Button href="/create">Create a bounty</Button>
          <Button href="/explorer" variant="ghost">Browse problems</Button>
        </div>
      </section>
    </div>
  );
}
