"use client";

/** Create bounty — funds escrow with a payable on-chain transaction. */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Field, inputCls } from "@/components/ui";
import { api } from "@/lib/api";
import { readContract, waitForTx, writeContract } from "@/lib/chain";
import { parseGen } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

export default function CreateBountyPage() {
  const router = useRouter();
  const { address, connect, signIn, token } = useWallet();

  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState("");
  const [trueProblem, setTrueProblem] = useState("");
  const [category, setCategory] = useState("Protocol");
  const [tags, setTags] = useState("");
  const [deadline, setDeadline] = useState("");
  const [amount, setAmount] = useState("1");
  const [phase, setPhase] = useState<"idle" | "signing" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!address) { await connect(); return; }
    let escrow: bigint;
    try {
      escrow = parseGen(amount);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (title.trim().length < 8) { setError("Title needs at least 8 characters."); return; }
    if (spec.trim().length < 40) { setError("Spec needs at least 40 characters."); return; }
    setPhase("signing");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const hash = await writeContract(address, "create_bounty", [
        title.trim(), spec.trim(), trueProblem.trim(), category.trim(),
        tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6).join(","),
        today, deadline.trim(),
      ], escrow);
      setPhase("pending");
      await waitForTx(hash);

      // Mirror for instant explorer visibility (indexer reconciles later).
      const stats = await readContract<{ bounties_total: number }>(
        "get_platform_stats").catch(() => null);
      const chainId = stats?.bounties_total ?? 0;
      const t = token ?? (await signIn());
      if (t && chainId > 0) {
        await api.mirrorBounty({
          chain_bounty_id: chainId,
          title: title.trim(),
          spec_text: spec.trim(),
          true_problem_text: trueProblem.trim(),
          category: category.trim(),
          tags: tags.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6),
          reward_escrow: escrow.toString(),
          deadline_note: deadline.trim(),
        }, t).catch(() => null);
      }
      setPhase("done");
      router.push(chainId > 0 ? `/bounty/${chainId}` : "/explorer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setPhase("idle");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-head text-h1 text-ink">Create a bounty</h1>
        <p className="mt-1 text-ink-soft">
          Your GEN goes into contract escrow the moment you sign. It can only
          leave through a consensus verdict — or back to you if nothing meets
          the bar.
        </p>
      </header>

      <Card>
        <div className="flex flex-col gap-5">
          <Field label="BOUNTY TITLE">
            <input className={inputCls} value={title} maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Stop users approving malicious transactions" />
          </Field>
          <Field label="THE SPECIFICATION (what you think you want)">
            <textarea className={`${inputCls} resize-none`} rows={6}
              value={spec} maxLength={8000}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="Describe the deliverable as you would in a traditional bounty…" />
          </Field>
          <Field label="THE DEEPER PROBLEM (optional)"
            hint="Leave blank to let solvers discover it — validators will judge whether they did.">
            <textarea className={`${inputCls} resize-none`} rows={4}
              value={trueProblem} maxLength={4000}
              onChange={(e) => setTrueProblem(e.target.value)}
              placeholder="Your hypothesis about the root cause…" />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="CATEGORY">
              <select className={inputCls} value={category}
                onChange={(e) => setCategory(e.target.value)}>
                {["Protocol", "DeFi", "UX", "Security", "Infra", "Research", "Tooling"]
                  .map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="TARGET DATE (display only)">
              <input className={inputCls} type="date" value={deadline}
                onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <Field label="TAGS (comma-separated, max 6)">
            <input className={inputCls} value={tags} maxLength={160}
              onChange={(e) => setTags(e.target.value)}
              placeholder="wallet, security, simulation" />
          </Field>
          <Field label="ESCROW AMOUNT (GEN)"
            hint="Minimum 0.001 GEN. 85% winner / 10% runner-up / 5% back to you.">
            <input className={inputCls} value={amount} inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)} />
          </Field>

          {error && (
            <p className="rounded border border-danger/40 bg-danger/10 p-2.5 font-mono text-tag text-danger">
              {error}
            </p>
          )}

          <Button onClick={() => void create()}
            busy={phase === "signing" || phase === "pending"}>
            {!address ? "Connect wallet to fund"
              : phase === "signing" ? "Confirm in wallet…"
              : phase === "pending" ? "Escrowing on-chain…"
              : `Fund with ${amount || "…"} GEN`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
