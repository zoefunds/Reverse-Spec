"use client";

/** Rewards — claim native GEN + reward ledger + leaderboard. */

import { useCallback, useEffect, useState } from "react";

import {
  Button, Card, EmptyState, StatCard, Tag,
} from "@/components/ui";
import { api, type LeaderboardRow, type RewardEvent } from "@/lib/api";
import { readContract, waitForTx, writeContract } from "@/lib/chain";
import { formatGen, shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

export default function RewardsPage() {
  const { address, connect } = useWallet();
  const [claimable, setClaimable] = useState<string>("0");
  const [history, setHistory] = useState<RewardEvent[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [phase, setPhase] = useState<"idle" | "signing" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.leaderboard().then(setBoard).catch(() => setBoard([]));
    if (!address) return;
    readContract<string>("get_claimable", [address])
      .then((v) => setClaimable(String(v))).catch(() => null);
    api.rewards(address.toLowerCase()).then(setHistory)
      .catch(() => setHistory([]));
  }, [address]);

  useEffect(() => { load(); }, [load]);

  async function claim() {
    if (!address) { await connect(); return; }
    setError(null);
    setPhase("signing");
    try {
      const hash = await writeContract(address, "claim_rewards", []);
      setPhase("pending");
      await waitForTx(hash);
      setPhase("done");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
      setPhase("idle");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-head text-h1 text-ink">Rewards</h1>
        <p className="mt-1 text-ink-soft">
          Escrow leaves the contract only two ways: consensus payouts and
          creator reclaims. Claims below are real GEN transfers to your wallet.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Claim card */}
          <Card className="border-l-4 border-l-primary-strong">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-tag uppercase text-ink-faint">
                  Claimable balance
                </span>
                <div className="font-head text-display text-primary">
                  {formatGen(claimable)} <span className="text-h3">GEN</span>
                </div>
              </div>
              {address ? (
                <Button onClick={() => void claim()}
                  disabled={claimable === "0"}
                  busy={phase === "signing" || phase === "pending"}>
                  {phase === "signing" ? "Confirm in wallet…"
                    : phase === "pending" ? "Transferring…"
                    : "Claim to wallet"}
                </Button>
              ) : (
                <Button onClick={() => void connect()}>Connect Wallet</Button>
              )}
            </div>
            {error && (
              <p className="mt-3 rounded border border-danger/40 bg-danger/10 p-2.5 font-mono text-tag text-danger">
                {error}
              </p>
            )}
            {phase === "done" && (
              <p className="mt-3 rounded border border-success/40 bg-success/10 p-2.5 font-mono text-tag text-success">
                CLAIMED — GEN transferred to {shortAddress(address)}.
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
                          {formatGen(r.amount)} GEN
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
                      {formatGen(row.earned_total)}
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
