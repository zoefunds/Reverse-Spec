"use client";

/** Dashboard — the connected wallet's bounties and submissions. */

import { useEffect, useState } from "react";
import Link from "next/link";

import { BountyCard } from "@/components/bounty";
import {
  Button, Card, EmptyState, Skeleton, StatCard, StatusTag,
} from "@/components/ui";
import { api, type Bounty, type Submission } from "@/lib/api";
import { readContract } from "@/lib/chain";
import { formatGen, shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

export default function DashboardPage() {
  const { address, connect } = useWallet();
  const [mine, setMine] = useState<Bounty[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [claimable, setClaimable] = useState<string>("0");
  const [stats, setStats] = useState<{
    submissions_total: number; wins: number; earned_total: string;
  } | null>(null);

  useEffect(() => {
    if (!address) return;
    const lower = address.toLowerCase();
    api.bounties({ limit: 50 }).then((page) => {
      setMine(page.items.filter(
        (b) => b.creator_address.toLowerCase() === lower));
      // Pull submissions per bounty and filter to the wallet.
      void Promise.all(
        page.items.map((b) =>
          api.bountySubmissions(b.chain_bounty_id).catch(() => [])),
      ).then((lists) => {
        setSubmissions(lists.flat().filter(
          (s) => s.solver_address.toLowerCase() === lower));
      });
    }).catch(() => { setMine([]); setSubmissions([]); });
    readContract<string>("get_claimable", [address])
      .then((v) => setClaimable(String(v))).catch(() => null);
    readContract<typeof stats>("get_solver_stats", [address])
      .then(setStats).catch(() => null);
  }, [address]);

  if (!address) {
    return (
      <EmptyState
        title="Connect your wallet"
        hint="Your bounties, submissions, and claimable rewards live here."
        action={<Button onClick={() => void connect()}>Connect Wallet</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-h1 text-ink">Dashboard</h1>
          <p className="font-mono text-tag text-ink-faint">{shortAddress(address)}</p>
        </div>
        <Button href="/create">+ Create Bounty</Button>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Claimable" accent="text-success"
          value={`${formatGen(claimable)} GEN`}
          sub={claimable !== "0" ? "Claim on the Rewards page" : undefined} />
        <StatCard label="Submissions"
          value={stats ? stats.submissions_total : "—"} />
        <StatCard label="Wins" accent="text-tertiary"
          value={stats ? stats.wins : "—"} />
        <StatCard label="Earned" accent="text-secondary"
          value={stats ? `${formatGen(stats.earned_total)} GEN` : "—"} />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-head text-h2 text-ink">My bounties</h2>
        {mine === null && <Skeleton className="h-40" />}
        {mine !== null && mine.length === 0 && (
          <Card className="py-8 text-center text-sm text-ink-soft">
            You haven&apos;t funded any bounties yet.
          </Card>
        )}
        {mine?.map((b) => <BountyCard key={b.chain_bounty_id} bounty={b} />)}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-head text-h2 text-ink">My submissions</h2>
        {submissions === null && <Skeleton className="h-28" />}
        {submissions !== null && submissions.length === 0 && (
          <Card className="py-8 text-center text-sm text-ink-soft">
            No submissions yet — go find a spec asking the wrong question.
          </Card>
        )}
        {submissions?.map((s) => (
          <Link key={s.chain_submission_id}
            href={`/bounty/${s.chain_bounty_id}`} className="group block">
            <Card className="transition-colors group-hover:border-primary-strong/50">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <StatusTag status={s.status} />
                    <span className="font-mono text-tag text-ink-faint">
                      bounty #{s.chain_bounty_id}
                    </span>
                  </div>
                  <h3 className="truncate font-head text-h3 text-ink group-hover:text-primary">
                    {s.title}
                  </h3>
                </div>
                {s.evaluation && (
                  <span className="shrink-0 font-mono text-h3 text-primary">
                    {s.evaluation.composite}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
