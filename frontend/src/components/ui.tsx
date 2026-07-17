"use client";

/** Design-system primitives — Cognitive Engineering System. */

import Link from "next/link";
import { STATUS_TONE } from "@/lib/format";

export function Button({
  children, onClick, href, variant = "primary", disabled, type = "button",
  className = "", busy = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  busy?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded px-4 py-2 " +
    "text-label font-mono transition-all active:scale-[0.98] " +
    "disabled:opacity-40 disabled:pointer-events-none";
  const tones = {
    primary:
      "bg-primary-strong text-primary-onstrong border border-primary-strong " +
      "border-t-[#5b80ff] hover:shadow-glowblue",
    ghost:
      "bg-transparent text-ink border border-line hover:bg-surface-high",
    danger:
      "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
  } as const;
  const cls = `${base} ${tones[variant]} ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy}
      className={cls}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

export function Card({
  children, className = "", pad = true,
}: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={`rounded-lg border border-line-soft bg-surface-mid ${pad ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function Tag({
  children, tone = "text-ink-soft border-line bg-surface-high",
}: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-tag uppercase ${tone}`}>
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  return <Tag tone={STATUS_TONE[status] ?? undefined}>{status}</Tag>;
}

export function StatCard({
  label, value, sub, accent = "text-primary",
}: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="font-mono text-tag uppercase text-ink-faint">{label}</span>
      <span className={`font-head text-h1 ${accent}`}>{value}</span>
      {sub && <span className="text-sm text-ink-soft">{sub}</span>}
    </Card>
  );
}

/** Circular score indicator (JetBrains Mono number, blue/purple ring). */
export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#2e5bff" : score >= 55 ? "#8b5cf6" : "#8e90a2";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#2d3449" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-ink">
        {score}
      </span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-surface-high ${className}`} />
  );
}

export function EmptyState({
  title, hint, action,
}: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="font-head text-h3 text-ink">{title}</span>
      {hint && <span className="max-w-sm text-sm text-ink-soft">{hint}</span>}
      {action}
    </Card>
  );
}

export function ErrorState({
  message, retry,
}: { message: string; retry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-danger/30 py-10 text-center">
      <span className="font-mono text-label text-danger">SOMETHING FAILED</span>
      <span className="max-w-md text-sm text-ink-soft">{message}</span>
      {retry && <Button variant="ghost" onClick={retry}>Retry</Button>}
    </Card>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-label text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-tag text-ink-faint">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded border border-line bg-surface-lowest px-3 py-2 text-body " +
  "text-ink placeholder:text-ink-faint focus:border-primary-strong " +
  "focus:outline-none focus:ring-2 focus:ring-primary-strong/25 transition-all";

/** Two-pane Spec vs Solution diff view (purple left, blue right). */
export function DiffPane({
  left, right, leftTitle = "ORIGINAL SPEC", rightTitle = "DEEPER PROBLEM",
}: {
  left: React.ReactNode; right: React.ReactNode;
  leftTitle?: string; rightTitle?: string;
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-line-soft md:grid-cols-2">
      <div className="border-l-2 border-l-secondary-strong bg-secondary-strong/5 p-4">
        <span className="mb-1.5 block font-mono text-tag uppercase text-secondary">
          {leftTitle}
        </span>
        <div className="text-sm leading-relaxed text-ink-soft">{left}</div>
      </div>
      <div className="border-l-2 border-l-primary-strong bg-primary-strong/5 p-4">
        <span className="mb-1.5 block font-mono text-tag uppercase text-primary">
          {rightTitle}
        </span>
        <div className="text-sm leading-relaxed text-ink-soft">{right}</div>
      </div>
    </div>
  );
}
