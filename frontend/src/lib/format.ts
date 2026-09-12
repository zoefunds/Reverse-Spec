/** Formatting helpers (GEN amounts, addresses, tiers). */

const GEN_DECIMALS = 18n;
const USDC_DECIMALS = 6n;

/** base units -> human GEN string, trimmed to 4 significant decimals. */
export function formatGen(baseUnits: string | bigint): string {
  let v: bigint;
  try {
    v = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits || "0");
  } catch {
    return "0";
  }
  const denom = 10n ** GEN_DECIMALS;
  const whole = v / denom;
  const frac = v % denom;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = (frac + denom).toString().slice(1, 5).replace(/0+$/, "");
  return `${whole.toLocaleString()}${fracStr ? "." + fracStr : ""}`;
}

/** human GEN string -> base units (throws on malformed input). */
export function parseGen(input: string): bigint {
  const cleaned = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(cleaned)) {
    throw new Error("Enter a valid GEN amount, e.g. 2.5");
  }
  const [whole, frac = ""] = cleaned.split(".");
  return (
    BigInt(whole) * 10n ** GEN_DECIMALS +
    BigInt(frac.padEnd(18, "0") || "0")
  );
}

/** base units (6 decimals) -> human USDC string, trimmed to 4 sig decimals. */
export function formatUsdc(baseUnits: string | bigint): string {
  let v: bigint;
  try {
    v = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits || "0");
  } catch {
    return "0";
  }
  const denom = 10n ** USDC_DECIMALS;
  const whole = v / denom;
  const frac = v % denom;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = (frac + denom).toString().slice(1, 5).replace(/0+$/, "");
  return `${whole.toLocaleString()}${fracStr ? "." + fracStr : ""}`;
}

/** human USDC string -> base units (6 decimals; throws on malformed input). */
export function parseUsdc(input: string): bigint {
  const cleaned = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) {
    throw new Error("Enter a valid USDC amount, e.g. 25.00");
  }
  const [whole, frac = ""] = cleaned.split(".");
  return (
    BigInt(whole) * 10n ** USDC_DECIMALS +
    BigInt(frac.padEnd(6, "0") || "0")
  );
}

/**
 * The real, contract-enforced submission deadline (unix seconds,
 * `opened_at + submission_window_secs`) — distinct from `deadline_note`,
 * a cosmetic creator-typed date with no bearing on when
 * `close_submissions` actually unlocks. Renders full date + time so it's
 * unambiguous, since the window can be as short as 1 hour.
 */
export function formatDeadline(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Human "closes in 42m" / "closed 3h ago" relative to now. */
export function formatCountdown(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const diffMs = unixSeconds * 1000 - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const label =
    mins < 60
      ? `${mins}m`
      : mins < 1440
        ? `${Math.round(mins / 60)}h`
        : `${Math.round(mins / 1440)}d`;
  return past ? `closed ${label} ago` : `closes in ${label}`;
}

export function shortAddress(addr?: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const TIER_LABEL: Record<string, string> = {
  OFF_TOPIC: "Off topic",
  SPEC_ONLY: "Spec only",
  PARTIAL_DEPTH: "Partial depth",
  DEEP_SOLUTION: "Deep solution",
  REDEFINING: "Redefining",
};

export const STATUS_TONE: Record<string, string> = {
  OPEN: "text-tertiary border-tertiary/40 bg-tertiary/10",
  EVALUATING: "text-warning border-warning/40 bg-warning/10",
  RESOLVED: "text-success border-success/40 bg-success/10",
  UNRESOLVED: "text-ink-soft border-line bg-surface-high",
  CANCELLED: "text-ink-faint border-line bg-surface-high",
  RECLAIMED: "text-ink-faint border-line bg-surface-high",
  PENDING: "text-ink-soft border-line bg-surface-high",
  EVALUATED: "text-primary border-primary/40 bg-primary/10",
  WINNER: "text-success border-success/40 bg-success/10",
  RUNNER_UP: "text-tertiary border-tertiary/40 bg-tertiary/10",
  REJECTED: "text-danger border-danger/40 bg-danger/10",
  WITHDRAWN: "text-ink-faint border-line bg-surface-high",
};
