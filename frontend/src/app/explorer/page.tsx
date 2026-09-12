"use client";

/** Explorer — searchable, filterable feed of bounties. */

import { useCallback, useEffect, useState } from "react";

import { BountyCard } from "@/components/bounty";
import {
  Button, EmptyState, ErrorState, inputCls, Skeleton, StatCard,
} from "@/components/ui";
import { api, type Bounty } from "@/lib/api";
import { readContract } from "@/lib/chain";
import { formatUsdc } from "@/lib/format";

const STATUSES = ["", "OPEN", "EVALUATING", "RESOLVED", "UNRESOLVED"] as const;
const PAGE_SIZE = 10;

export default function ExplorerPage() {
  const [items, setItems] = useState<Bounty[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chainStats, setChainStats] = useState<{
    bounties_open: number; open_escrow: string; submissions_total: number;
  } | null>(null);

  const load = useCallback(async (nextOffset = 0) => {
    setError(null);
    setItems(null);
    try {
      const page = await api.bounties({
        q: q || undefined, status: status || undefined,
        offset: nextOffset, limit: PAGE_SIZE,
      });
      setItems(page.items);
      setTotal(page.total);
      setOffset(nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bounties");
      setItems([]);
    }
  }, [q, status]);

  useEffect(() => { void load(0); }, [load]);
  useEffect(() => {
    api.stats()
      .then((s) => {
        if (s.platform) setChainStats(s.platform as never);
        else throw new Error("no snapshot yet");
      })
      .catch(() =>
        readContract<typeof chainStats>("get_platform_stats")
          .then(setChainStats).catch(() => null));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-head text-h1 text-ink">Bounty Explorer</h1>
        <p className="text-ink-soft">
          Problems funded in USDC via a Base Sepolia escrow, adjudicated by validator consensus.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open bounties"
          value={chainStats ? chainStats.bounties_open : "—"} />
        <StatCard label="Escrow live" accent="text-tertiary"
          value={chainStats ? `${formatUsdc(chainStats.open_escrow)} USDC` : "—"} />
        <StatCard label="Total submissions" accent="text-secondary"
          value={chainStats ? chainStats.submissions_total : "—"} />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, specs, tags…"
          className={`${inputCls} sm:max-w-sm`}
        />
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)}
              className={`rounded border px-2.5 py-1.5 font-mono text-tag uppercase transition-colors ${
                status === s
                  ? "border-primary-strong bg-primary-strong/15 text-primary"
                  : "border-line text-ink-faint hover:text-ink"
              }`}>
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {items === null && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      )}
      {items !== null && error && (
        <ErrorState message={error} retry={() => void load(offset)} />
      )}
      {items !== null && !error && items.length === 0 && (
        <EmptyState
          title="No bounties match"
          hint="Try clearing filters — or be the first to fund a problem worth solving."
          action={<Button href="/create">Create bounty</Button>}
        />
      )}
      {items !== null && items.length > 0 && (
        <div className="flex flex-col gap-4">
          {items.map((b) => <BountyCard key={b.chain_bounty_id} bounty={b} />)}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4">
          <Button variant="ghost" disabled={offset === 0}
            onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}>
            ← Prev
          </Button>
          <span className="font-mono text-tag text-ink-faint">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button variant="ghost" disabled={offset + PAGE_SIZE >= total}
            onClick={() => void load(offset + PAGE_SIZE)}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
