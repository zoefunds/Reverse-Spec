"use client";

/** Bounty-domain components: explorer card + evaluation verdict panel. */

import Link from "next/link";

import { Card, DiffPane, ScoreRing, StatusTag, Tag } from "@/components/ui";
import type { Bounty, Evaluation } from "@/lib/api";
import { formatUsdc, formatCountdown, TIER_LABEL } from "@/lib/format";

export function BountyCard({ bounty }: { bounty: Bounty }) {
  return (
    <Link href={`/bounty/${bounty.chain_bounty_id}`} className="group block">
      <Card className="transition-all group-hover:-translate-y-0.5 group-hover:border-primary-strong/50">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <StatusTag status={bounty.status} />
                {bounty.category && <Tag>{bounty.category}</Tag>}
                {bounty.tags.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
              <h3 className="truncate font-head text-h3 text-ink transition-colors group-hover:text-primary">
                {bounty.title}
              </h3>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-h3 text-tertiary">
                {formatUsdc(bounty.reward_escrow)} USDC
              </div>
              <div className="font-mono text-tag text-ink-faint">
                #{bounty.chain_bounty_id} · {bounty.submission_count} submissions
              </div>
              {bounty.status === "OPEN" && bounty.submission_deadline > 0 && (
                <div className="font-mono text-tag text-ink-faint">
                  {formatCountdown(bounty.submission_deadline)}
                </div>
              )}
            </div>
          </div>
          <DiffPane
            left={<p className="line-clamp-3">{bounty.spec_text}</p>}
            right={
              <p className="line-clamp-3">
                {bounty.true_problem_text ||
                  "Undeclared — discovering the deeper problem is the challenge."}
              </p>
            }
          />
        </div>
      </Card>
    </Link>
  );
}

export function VerdictPanel({ evaluation }: { evaluation: Evaluation }) {
  const rows = [
    ["Problem depth", evaluation.problem_depth, "40%"],
    ["Superiority", evaluation.superiority, "30%"],
    ["Evidence quality", evaluation.evidence_quality, "20%"],
    ["Spec compliance", evaluation.spec_compliance, "10%"],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-tag uppercase text-ink-faint">
            Consensus verdict
          </span>
          <div className="font-head text-h3 text-ink">
            {TIER_LABEL[evaluation.tier] ?? evaluation.tier}
          </div>
        </div>
        <ScoreRing score={evaluation.composite} />
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(([label, score, weight]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 font-mono text-tag text-ink-soft">
              {label} <span className="text-ink-faint">({weight})</span>
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-highest">
              <div className="h-full bg-primary-strong"
                style={{ width: `${score}%` }} />
            </div>
            <span className="w-8 text-right font-mono text-sm text-ink">
              {score}
            </span>
          </div>
        ))}
      </div>
      <blockquote className="border-l-2 border-l-primary-strong bg-primary-strong/5 p-3 text-sm italic leading-relaxed text-ink-soft">
        {evaluation.reasoning}
      </blockquote>
      {evaluation.evidence_excerpt && (
        <div className="rounded border border-line-soft bg-surface-lowest p-3">
          <span className="mb-1 block font-mono text-tag uppercase text-ink-faint">
            Evidence cited by validators
            {!evaluation.evidence_fetch_ok && " (fetch failed)"}
          </span>
          <code className="break-all font-mono text-sm text-tertiary">
            {evaluation.evidence_excerpt}
          </code>
        </div>
      )}
    </div>
  );
}
