"use client";

/**
 * Create bounty — two-step flow now that funding lives on Base Sepolia:
 *   1) create_bounty on GenLayer (no value attached; leaves the bounty
 *      PENDING_FUNDING) with a submission window.
 *   2) approve + fund USDC on the Base Sepolia escrow, then poll
 *      get_bounty until the relayer confirms the deposit and flips the
 *      bounty to OPEN.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, Field, inputCls } from "@/components/ui";
import { api } from "@/lib/api";
import { approveAndFund } from "@/lib/baseSepolia";
import { readContract, waitForTx, writeContract } from "@/lib/chain";
import { parseUsdc } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const WINDOW_PRESETS = [
  { label: "24 hours", secs: 24 * 3600 },
  { label: "72 hours", secs: 72 * 3600 },
  { label: "7 days", secs: 7 * 86400 },
  { label: "14 days", secs: 14 * 86400 },
  { label: "30 days", secs: 30 * 86400 },
] as const;

type Phase =
  | "idle" | "creating" | "created"
  | "approving" | "funding" | "waiting-relayer"
  | "open" | "timed-out" | "failed";

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

export default function CreateBountyPage() {
  const router = useRouter();
  const { address, connect, signIn, token } = useWallet();

  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState("");
  const [trueProblem, setTrueProblem] = useState("");
  const [category, setCategory] = useState("Protocol");
  const [tags, setTags] = useState("");
  const [deadline, setDeadline] = useState("");
  const [amount, setAmount] = useState("25");
  const [windowSecs, setWindowSecs] = useState<number>(WINDOW_PRESETS[2].secs);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bountyId, setBountyId] = useState<number | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  function pollForOpen(id: number) {
    setPhase("waiting-relayer");
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
    pollTimer.current = setInterval(async () => {
      try {
        const fresh = await readContract<{ status: string }>("get_bounty", [id]);
        if (fresh.status === "OPEN") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase("open");
          router.push(`/bounty/${id}`);
          return;
        }
      } catch {
        // transient read failure — keep polling until timeout
      }
      if (Date.now() >= pollDeadline.current) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setPhase("timed-out");
      }
    }, POLL_INTERVAL_MS);
  }

  async function create() {
    setError(null);
    if (!address) { await connect(); return; }
    let escrow: bigint;
    try {
      escrow = parseUsdc(amount);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (title.trim().length < 8) { setError("Title needs at least 8 characters."); return; }
    if (spec.trim().length < 40) { setError("Spec needs at least 40 characters."); return; }

    setPhase("creating");
    let id = bountyId;
    try {
      if (id === null) {
        const today = new Date().toISOString().slice(0, 10);
        const hash = await writeContract(address, "create_bounty", [
          title.trim(), spec.trim(), trueProblem.trim(), category.trim(),
          tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6).join(","),
          today, deadline.trim(), windowSecs,
        ]);
        await waitForTx(hash);

        const stats = await readContract<{ bounties_total: number }>(
          "get_platform_stats").catch(() => null);
        id = stats?.bounties_total ?? null;
        if (!id) throw new Error("Bounty created but couldn't resolve its id");
        setBountyId(id);

        const t = token ?? (await signIn());
        if (t) {
          await api.mirrorBounty({
            chain_bounty_id: id,
            title: title.trim(),
            spec_text: spec.trim(),
            true_problem_text: trueProblem.trim(),
            category: category.trim(),
            tags: tags.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6),
            reward_escrow: escrow.toString(),
            deadline_note: deadline.trim(),
          }, t).catch(() => null);
        }
      }
      setPhase("created");

      setPhase("approving");
      await approveAndFund(address, id, escrow);
      // approveAndFund resolves once the fund() tx is confirmed on Base
      // Sepolia; the relayer still needs to relay it back to GenLayer.
      setPhase("funding");
      pollForOpen(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setPhase(id !== null ? "created" : "idle");
    }
  }

  const busy = phase === "creating" || phase === "approving" ||
    phase === "funding" || phase === "waiting-relayer";

  function buttonLabel(): string {
    if (!address) return "Connect wallet to fund";
    switch (phase) {
      case "creating": return "Creating bounty…";
      case "created": return `Fund ${amount || "…"} USDC`;
      case "approving": return "Approve USDC in wallet…";
      case "funding": return "Confirm funding in wallet…";
      case "waiting-relayer": return "Waiting for relayer confirmation…";
      case "open": return "Funded — opening bounty…";
      case "timed-out": return "Retry funding check";
      case "failed": return "Retry";
      default: return `Create & fund ${amount || "…"} USDC`;
    }
  }

  async function onButtonClick() {
    if (phase === "timed-out" && bountyId !== null) {
      pollForOpen(bountyId);
      return;
    }
    await create();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-head text-h1 text-ink">Create a bounty</h1>
        <p className="mt-1 text-ink-soft">
          Bounties are created on GenLayer, then funded with USDC on Base
          Sepolia. Funds sit in the escrow contract and can only leave
          through a consensus verdict — or back to you if nothing meets
          the bar.
        </p>
      </header>

      <Card>
        <div className="flex flex-col gap-5">
          <Field label="BOUNTY TITLE">
            <input className={inputCls} value={title} maxLength={160}
              disabled={bountyId !== null}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Stop users approving malicious transactions" />
          </Field>
          <Field label="THE SPECIFICATION (what you think you want)">
            <textarea className={`${inputCls} resize-none`} rows={6}
              value={spec} maxLength={8000} disabled={bountyId !== null}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="Describe the deliverable as you would in a traditional bounty…" />
          </Field>
          <Field label="THE DEEPER PROBLEM (optional)"
            hint="Leave blank to let solvers discover it — validators will judge whether they did.">
            <textarea className={`${inputCls} resize-none`} rows={4}
              value={trueProblem} maxLength={4000} disabled={bountyId !== null}
              onChange={(e) => setTrueProblem(e.target.value)}
              placeholder="Your hypothesis about the root cause…" />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="CATEGORY">
              <select className={inputCls} value={category} disabled={bountyId !== null}
                onChange={(e) => setCategory(e.target.value)}>
                {["Protocol", "DeFi", "UX", "Security", "Infra", "Research", "Tooling"]
                  .map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="TARGET DATE (display only)">
              <input className={inputCls} type="date" value={deadline}
                disabled={bountyId !== null}
                onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <Field label="TAGS (comma-separated, max 6)">
            <input className={inputCls} value={tags} maxLength={160}
              disabled={bountyId !== null}
              onChange={(e) => setTags(e.target.value)}
              placeholder="wallet, security, simulation" />
          </Field>
          <Field label="SUBMISSION WINDOW"
            hint="How long the bounty stays open to new submissions once funding is confirmed.">
            <select className={inputCls} value={windowSecs} disabled={bountyId !== null}
              onChange={(e) => setWindowSecs(Number(e.target.value))}>
              {WINDOW_PRESETS.map((p) => (
                <option key={p.secs} value={p.secs}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="ESCROW AMOUNT (USDC)"
            hint="Minimum 1.00 USDC. 85% winner / 10% runner-up / 5% back to you.">
            <input className={inputCls} value={amount} inputMode="decimal"
              disabled={bountyId !== null}
              onChange={(e) => setAmount(e.target.value)} />
          </Field>

          {error && (
            <p className="rounded border border-danger/40 bg-danger/10 p-2.5 font-mono text-tag text-danger">
              {error}
            </p>
          )}

          {phase === "waiting-relayer" && (
            <p className="rounded border border-tertiary/40 bg-tertiary/10 p-2.5 font-mono text-tag text-tertiary">
              Funding submitted on Base Sepolia — waiting for the relayer to
              confirm it on GenLayer. This page will move on automatically
              once the bounty opens.
            </p>
          )}
          {phase === "timed-out" && (
            <p className="rounded border border-warning/40 bg-warning/10 p-2.5 font-mono text-tag text-warning">
              Funding was submitted but hasn&apos;t been confirmed yet. It
              will appear as OPEN on the bounty page once the relayer picks
              it up — you can also check again now.
            </p>
          )}

          <Button onClick={() => void onButtonClick()} busy={busy}>
            {buttonLabel()}
          </Button>

          {bountyId !== null && phase !== "waiting-relayer" && phase !== "open" && (
            <p className="text-center font-mono text-tag text-ink-faint">
              Bounty #{bountyId} created on GenLayer — awaiting funding.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
