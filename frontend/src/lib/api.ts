/** Backend API client — thin typed fetch wrapper with error surfacing. */

import { CONFIG } from "@/lib/config";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${CONFIG.apiBase}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

// --- types mirrored from backend schemas -----------------------------------

export interface Bounty {
  chain_bounty_id: number;
  creator_address: string;
  title: string;
  spec_text: string;
  true_problem_text: string;
  category: string;
  tags: string[];
  reward_escrow: string;
  initial_escrow: string;
  status: string;
  deadline_note: string;
  submission_window_secs: number;
  opened_at: number;
  submission_deadline: number;
  submission_count: number;
  evaluated_count: number;
  winner_submission_id: number;
  resolution_summary: string;
}

export interface Evaluation {
  spec_compliance: number;
  problem_depth: number;
  superiority: number;
  evidence_quality: number;
  composite: number;
  tier: string;
  reasoning: string;
  evidence_excerpt: string;
  evidence_fetch_ok: boolean;
}

export interface Submission {
  chain_submission_id: number;
  chain_bounty_id: number;
  solver_address: string;
  title: string;
  rationale: string;
  evidence_url: string;
  status: string;
  evaluation: Evaluation | null;
}

export interface LeaderboardRow {
  address: string;
  display_name: string | null;
  depth_score_total: number;
  wins: number;
  runner_ups: number;
  submissions_total: number;
  earned_total: string;
}

export interface RewardEvent {
  chain_bounty_id: number;
  chain_submission_id: number;
  amount: string;
  kind: string;
  settled: boolean;
  recorded_at: string;
}

export interface Profile {
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  skill_tags: string[];
}

// --- endpoints ---------------------------------------------------------------

export const api = {
  nonce: (address: string) =>
    request<{ nonce: string; message: string }>("/auth/nonce", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),
  verify: (address: string, signature: string) =>
    request<{ token: string; address: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    }),
  bounties: (params: Record<string, string | number | undefined> = {}) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return request<{ total: number; items: Bounty[] }>(
      `/bounties${qs ? `?${qs}` : ""}`,
    );
  },
  bounty: (id: number) => request<Bounty>(`/bounties/${id}`),
  bountySubmissions: (id: number) =>
    request<Submission[]>(`/bounties/${id}/submissions`),
  mirrorBounty: (body: unknown, token: string) =>
    request<Bounty>("/bounties", {
      method: "POST",
      body: JSON.stringify(body),
    }, token),
  mirrorSubmission: (body: unknown, token: string) =>
    request<Submission>("/submissions", {
      method: "POST",
      body: JSON.stringify(body),
    }, token),
  leaderboard: () => request<LeaderboardRow[]>("/leaderboard"),
  stats: () =>
    request<{ platform: Record<string, unknown> | null }>("/stats"),
  rewards: (address: string) => request<RewardEvent[]>(`/rewards/${address}`),
  profile: (address: string) => request<Profile>(`/users/${address}`),
  updateMe: (body: unknown, token: string) =>
    request<Profile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token),
};
