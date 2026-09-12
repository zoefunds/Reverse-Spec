"use client";

/**
 * Rewards — claim USDC payouts from the Base Sepolia escrow.
 *
 * `claim_rewards` no longer exists on the GenLayer contract: payouts are
 * held in the escrow's `claimable(bountyId, account)` mapping and pulled
 * out per-bounty via the escrow's own `claim(bountyId)`. We derive the set
 * of bounties worth checking from the reward history the indexer already
 * tracks, then read claimable balances straight from Base Sepolia.
 */

import { useCallback, useEffect, useState } from "react";

import {
  Button, Card, EmptyState, StatCard, Tag,
} from "@/components/ui";
import { api, type LeaderboardRow, type RewardEvent } from "@/lib/api";
import { claimPayout, getClaimable } from "@/lib/baseSepolia";
import { formatUsdc, shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

interface ClaimRow {
  chain_bounty_id: number;
  claimable: bigint;
}

export default function RewardsPage() {
  const { address, connect } = useWallet();
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [history, setHistory] = useState<RewardEvent[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    api.leaderboard().then(setBoard).catch(() => setBoard([]));
    if (!address) { setClaims(null); return; }
    const hist = await api.rewards(address.toLowerCase()).catch(() => [] as RewardEvent[]);
    setHistory(hist);

    const bountyIds = Array.from(new Set(hist.map((r) => r.chain_bounty_id)))
      .filter((id) => id > 0);
    try {
      const rows = await Promise.all(bountyIds.map(async (id) => ({
        chain_bounty_id: id,
        claimable: await getClaimable(id, address).catch(() => 0n),
      })));
      setClaims(rows.filter((r) => r.claimable > 0n));
    } catch {
      setClaims([]);
    }
  }, [address]);

  useEffect(() => { void load(); }, [load]);

  async function claim(row: ClaimRow) {
    if (!address) { await connect(); return; }
    setError(null);
    setNotice(null);
    setClaimingId(row.chain_bounty_id);
    try {
      await claimPayout(address, row.chain_bounty_id);
      setNotice(`Claimed ${formatUsdc(row.claimable)} USDC for bounty #${row.chain_bounty_id}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaimingId(null);
    }
  }

  const totalClaimable = (claims ?? []).reduce((sum, r) => sum + r.claimable, 0n);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-head text-h1 text-ink">Rewards</h1>
        <p className="mt-1 text-ink-soft">
          GenLayer judges submissions; payouts settle as USDC on the Base
          Sepolia escrow. Claims below are real USDC transfers straight from
          that contract to your wallet — GenLayer never touches the funds.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Claim card */}
          <Card className="border-l-4 border-l-primary-strong">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-tag uppercase text-ink-faint">
                  Total claimable
                </span>
                <div className="font-head text-display text-primary">
                  {formatUsdc(totalClaimable)} <span className="text-h3">USDC</span>
                </div>
              </div>
              {!address && <Button onClick={() => void connect()}>Connect Wallet</Button>}
            </div>
            {error && (
              <p className="mt-3 rounded border border-danger/40 bg-danger/10 p-2.5 font-mono text-tag text-danger">
                {error}
              </p>
            )}
            {notice && (
              <p className="mt-3 rounded border border-success/40 bg-success/10 p-2.5 font-mono text-tag text-success">
                {notice}
              </p>
            )}

            {address && claims !== null && claims.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {claims.map((row) => (
                  <div key={row.chain_bounty_id}
                    className="flex items-center justify-between rounded border border-line-soft p-3">
                    <div>
                      <div className="font-mono text-sm text-ink">
                        Bounty #{row.chain_bounty_id}
                      </div>
                      <div className="font-mono text-tag text-tertiary">
                        {formatUsdc(row.claimable)} USDC claimable
                      </div>
                    </div>
                    <Button onClick={() => void claim(row)}
                      busy={claimingId === row.chain_bounty_id}>
                      {claimingId === row.chain_bounty_id
                        ? "Confirm in wallet…" : "Claim to wallet"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {address && claims !== null && claims.length === 0 && (
              <p className="mt-4 text-sm text-ink-soft">
                Nothing claimable right now.
              </p>
            )}
          </Card>

          {/* History */}
          <Card pad={false}>
            <div className="border-b border-line-soft px-5 py-3">
              <h2 className="font-mono text-label text-ink">REWARD HISTORY</h2>
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-soft">
                {address
                  ? "No reward events yet."
                  : "Connect your wallet to see your history."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-sm">
                  <thead>
                    <tr className="bg-surface-lowest text-tag uppercase text-ink-faint">
                      <th className="px-5 py-2.5">Bounty</th>
                      <th className="px-5 py-2.5">Kind</th>
                      <th className="px-5 py-2.5">Amount</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {history.map((r, i) => (
                      <tr key={i} className="hover:bg-surface-high/40">
                        <td className="px-5 py-3 text-primary">
                          #{r.chain_bounty_id || "—"}
                        </td>
                        <td className="px-5 py-3"><Tag>{r.kind}</Tag></td>
                        <td className="px-5 py-3 text-ink">
                          {formatUsdc(r.amount)} USDC
                        </td>
                        <td className="px-5 py-3">
                          <span className={r.settled ? "text-success" : "text-warning"}>
                            {r.settled ? "Settled" : "Claimable"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Leaderboard */}
        <aside>
          <Card>
            <h2 className="mb-1 font-head text-h3 text-ink">Leaderboard</h2>
            <p className="mb-4 font-mono text-tag uppercase text-ink-faint">
              Ranked by problem depth
            </p>
            {board.length === 0 ? (
              <EmptyState title="No solvers ranked yet"
                hint="Depth scores accrue as evaluations finalize." />
            ) : (
              <div className="flex flex-col gap-2">
                {board.slice(0, 10).map((row, i) => (
                  <div key={row.address}
                    className={`flex items-center gap-3 rounded p-2.5 ${
                      i === 0 ? "bg-primary-strong/10 border border-primary-strong/25"
                        : "border border-line-soft"
                    }`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-tag ${
                      i === 0 ? "bg-primary-strong text-primary-onstrong"
                        : "bg-surface-highest text-ink-soft"
                    }`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-ink">
                        {row.display_name || shortAddress(row.address)}
                      </p>
                      <p className="font-mono text-tag text-ink-faint">
                        depth {row.depth_score_total} · {row.wins} wins
                      </p>
                    </div>
                    <span className="font-mono text-tag text-tertiary">
                      {formatUsdc(row.earned_total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
