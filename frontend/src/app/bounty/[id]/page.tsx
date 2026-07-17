"use client";

/** Bounty detail — split view: problem (left) + submit/manage (right). */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { VerdictPanel } from "@/components/bounty";
import {
  Button, Card, DiffPane, ErrorState, Field, inputCls, Skeleton, StatusTag,
  Tag,
} from "@/components/ui";
import { api, type Bounty, type Submission } from "@/lib/api";
import { waitForTx, writeContract } from "@/lib/chain";
import { formatGen, shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

type TxPhase = "idle" | "signing" | "pending" | "done" | "failed";

export default function BountyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { address, connect, signIn, token } = useWallet();

  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Submission form state
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, s] = await Promise.all([
        api.bounty(id), api.bountySubmissions(id),
      ]);
      setBounty(b);
      setSubs(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bounty");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const isCreator = address &&
    bounty?.creator_address.toLowerCase() === address.toLowerCase();

  async function runTx(fn: () => Promise<string>, after?: () => Promise<void>) {
    setTxError(null);
    setPhase("signing");
    try {
      const hash = await fn();
      setPhase("pending");
      await waitForTx(hash);
      if (after) await after();
      setPhase("done");
      await load();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
      setPhase("failed");
    }
  }

  async function submitSolution() {
    if (!address) { await connect(); return; }
    if (title.trim().length < 8) { setTxError("Title too short (min 8 chars)"); return; }
    if (rationale.trim().length < 80) { setTxError("Rationale too short (min 80 chars)"); return; }
    if (!url.startsWith("https://")) { setTxError("Evidence URL must be https://"); return; }
    await runTx(
      () => writeContract(address, "submit_solution",
        [id, title.trim(), rationale.trim(), url.trim()]),
      async () => {
        // Mirror to the read-model for instant explorer visibility.
        const t = token ?? (await signIn());
        if (t) {
          const fresh = await api.bountySubmissions(id).catch(() => []);
          const mine = fresh.length + 1; // best-effort; indexer reconciles
          await api.mirrorSubmission({
            chain_submission_id: mine,
            chain_bounty_id: id,
            title: title.trim(),
            rationale: rationale.trim(),
            evidence_url: url.trim(),
          }, t).catch(() => null);
        }
      },
    );
  }

  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!bounty) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-52" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const open = bounty.status === "OPEN";

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-tag text-ink-faint">
          <span>BOUNTY #{bounty.chain_bounty_id}</span>
          <span>·</span>
          <span>by {shortAddress(bounty.creator_address)}</span>
          {bounty.deadline_note && (<><span>·</span><span>target {bounty.deadline_note}</span></>)}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="max-w-2xl font-head text-h1 text-ink">{bounty.title}</h1>
          <div className="text-right">
            <div className="font-mono text-h2 text-tertiary">
              {formatGen(bounty.reward_escrow)} GEN
            </div>
            <StatusTag status={bounty.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {bounty.category && <Tag>{bounty.category}</Tag>}
          {bounty.tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: the problem */}
        <section className="flex flex-col gap-6 lg:col-span-7">
          <DiffPane
            left={<p className="whitespace-pre-wrap">{bounty.spec_text}</p>}
            right={
              <p className="whitespace-pre-wrap">
                {bounty.true_problem_text ||
                  "The creator left this blank. Part of the challenge is proving what the real problem is."}
              </p>
            }
          />
          {bounty.resolution_summary && (
            <Card className="border-success/30">
              <span className="mb-1 block font-mono text-tag uppercase text-success">
                Resolution
              </span>
              <p className="text-sm text-ink-soft">{bounty.resolution_summary}</p>
            </Card>
          )}

          {/* Submissions & verdicts */}
          <div className="flex flex-col gap-4">
            <h2 className="font-head text-h2 text-ink">
              Submissions ({subs.length})
            </h2>
            {subs.length === 0 && (
              <Card className="py-8 text-center text-sm text-ink-soft">
                No submissions yet — the deeper problem is unclaimed.
              </Card>
            )}
            {subs.map((s) => (
              <Card key={s.chain_submission_id}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <StatusTag status={s.status} />
                      <span className="font-mono text-tag text-ink-faint">
                        #{s.chain_submission_id} · {shortAddress(s.solver_address)}
                      </span>
                    </div>
                    <h3 className="font-head text-h3 text-ink">{s.title}</h3>
                  </div>
                  <a href={s.evidence_url} target="_blank" rel="noreferrer"
                    className="shrink-0 font-mono text-tag text-primary hover:underline">
                    EVIDENCE ↗
                  </a>
                </div>
                <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {s.rationale}
                </p>
                {s.evaluation && <VerdictPanel evaluation={s.evaluation} />}
              </Card>
            ))}
          </div>
        </section>

        {/* Right: act */}
        <aside className="flex flex-col gap-4 lg:col-span-5">
          {open && (
            <Card>
              <h2 className="mb-4 font-head text-h3 text-ink">Submit a solution</h2>
              <div className="flex flex-col gap-4">
                <Field label="SOLUTION TITLE">
                  <input className={inputCls} value={title} maxLength={160}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Transaction simulation instead of dialogs" />
                </Field>
                <Field label="WHY THIS SOLVES THE DEEPER PROBLEM"
                  hint="Validators treat this as claims — the evidence artifact is what gets verified.">
                  <textarea className={`${inputCls} resize-none`} rows={6}
                    value={rationale} maxLength={6000}
                    onChange={(e) => setRationale(e.target.value)}
                    placeholder="Explain the root cause and how your work addresses it…" />
                </Field>
                <Field label="PUBLIC EVIDENCE URL"
                  hint="Repo / gist / published doc. Every validator fetches this live — prose alone cannot win.">
                  <input className={inputCls} value={url} maxLength={400}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/you/solution" />
                </Field>
                {txError && (
                  <p className="rounded border border-danger/40 bg-danger/10 p-2.5 font-mono text-tag text-danger">
                    {txError}
                  </p>
                )}
                {phase === "done" && (
                  <p className="rounded border border-success/40 bg-success/10 p-2.5 font-mono text-tag text-success">
                    SUBMITTED — the transaction is on-chain.
                  </p>
                )}
                <Button onClick={() => void submitSolution()}
                  busy={phase === "signing" || phase === "pending"}>
                  {!address ? "Connect wallet to submit"
                    : phase === "signing" ? "Confirm in wallet…"
                    : phase === "pending" ? "Waiting for consensus…"
                    : "Submit on-chain"}
                </Button>
                <p className="text-center font-mono text-tag text-ink-faint">
                  Signed by your wallet · escrow stays locked until finalization
                </p>
              </div>
            </Card>
          )}

          {isCreator && (
            <Card className="border-secondary-strong/30">
              <h2 className="mb-3 font-head text-h3 text-ink">Creator controls</h2>
              <div className="flex flex-col gap-2.5">
                {bounty.status === "OPEN" && (
                  <>
                    <Button variant="ghost"
                      onClick={() => void runTx(() => writeContract(address!, "close_submissions", [id]))}>
                      Close submissions → start evaluation
                    </Button>
                    <Button variant="danger"
                      onClick={() => void runTx(() => writeContract(address!, "cancel_bounty", [id]))}>
                      Cancel & refund (only if no submissions)
                    </Button>
                  </>
                )}
                {bounty.status === "EVALUATING" && (
                  <>
                    {subs.filter((s) => s.status === "PENDING").map((s) => (
                      <Button key={s.chain_submission_id} variant="ghost"
                        onClick={() => void runTx(() =>
                          writeContract(address!, "evaluate_submission",
                            [s.chain_submission_id]))}>
                        Evaluate #{s.chain_submission_id}
                      </Button>
                    ))}
                    <Button
                      onClick={() => void runTx(() => writeContract(address!, "finalize_bounty", [id]))}>
                      Finalize & distribute escrow
                    </Button>
                  </>
                )}
                {bounty.status === "UNRESOLVED" && (
                  <Button variant="ghost"
                    onClick={() => void runTx(() => writeContract(address!, "reclaim_escrow", [id]))}>
                    Reclaim escrow
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Payout structure */}
          <Card>
            <h2 className="mb-3 font-head text-h3 text-ink">Payout structure</h2>
            <div className="flex flex-col gap-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Winner</span>
                <span className="text-ink">85%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Runner-up</span>
                <span className="text-ink">10%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Creator reserve</span>
                <span className="text-ink">5%</span>
              </div>
              <div className="mt-1 border-t border-line-soft pt-2 text-tag text-ink-faint">
                No winner → full escrow reclaimable by creator. All movements
                are native GEN transfers inside the contract.
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
