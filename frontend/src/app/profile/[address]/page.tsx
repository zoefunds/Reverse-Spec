"use client";

/** Public solver profile: stats, proof-of-innovation gallery, editing. */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Button, Card, DiffPane, Field, inputCls, Skeleton, StatCard, StatusTag, Tag,
} from "@/components/ui";
import { api, type Profile, type Submission } from "@/lib/api";
import { readContract } from "@/lib/chain";
import { formatGen, shortAddress } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

interface SolverStats {
  submissions_total: number;
  wins: number;
  runner_ups: number;
  rejected: number;
  depth_score_total: number;
  earned_total: string;
}

export default function ProfilePage() {
  const params = useParams<{ address: string }>();
  const addr = params.address.toLowerCase();
  const { address: me, token, signIn } = useWallet();
  const isMe = me?.toLowerCase() === addr;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<SolverStats | null>(null);
  const [work, setWork] = useState<Submission[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");

  const load = useCallback(() => {
    api.profile(addr).then((p) => {
      setProfile(p);
      setName(p.display_name ?? "");
      setBio(p.bio ?? "");
      setTags(p.skill_tags.join(", "));
    }).catch(() => null);
    readContract<SolverStats>("get_solver_stats", [addr])
      .then(setStats).catch(() => null);
    api.bounties({ limit: 50 }).then(async (page) => {
      const lists = await Promise.all(page.items.map((b) =>
        api.bountySubmissions(b.chain_bounty_id).catch(() => [])));
      setWork(lists.flat().filter(
        (s) => s.solver_address.toLowerCase() === addr));
    }).catch(() => setWork([]));
  }, [addr]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const t = token ?? (await signIn());
    if (!t) return;
    await api.updateMe({
      display_name: name,
      bio,
      skill_tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
    }, t).catch(() => null);
    setEditing(false);
    load();
  }

  const wonWork = (work ?? []).filter(
    (s) => s.status === "WINNER" || s.status === "RUNNER_UP");
  const otherWork = (work ?? []).filter(
    (s) => s.status !== "WINNER" && s.status !== "RUNNER_UP");

  return (
    <div className="flex flex-col gap-8">
      {/* Header card */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-primary/25 bg-surface-lowest font-head text-h2 text-primary">
              {(profile?.display_name ?? addr.slice(2, 4)).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="font-head text-h2 text-ink">
                {profile?.display_name || shortAddress(addr)}
              </h1>
              <p className="font-mono text-tag text-ink-faint">{addr}</p>
              {profile?.bio && (
                <p className="mt-1.5 max-w-xl text-sm text-ink-soft">{profile.bio}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isMe && !editing && (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            )}
            <div className="flex flex-wrap justify-end gap-1.5">
              {(profile?.skill_tags ?? []).map((t) => (
                <Tag key={t} tone="text-primary border-primary/25 bg-primary/10">{t}</Tag>
              ))}
            </div>
          </div>
        </div>

        {isMe && editing && (
          <div className="mt-5 flex flex-col gap-4 border-t border-line-soft pt-5">
            <Field label="DISPLAY NAME">
              <input className={inputCls} value={name} maxLength={80}
                onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="BIO">
              <textarea className={`${inputCls} resize-none`} rows={3}
                value={bio} maxLength={1000}
                onChange={(e) => setBio(e.target.value)} />
            </Field>
            <Field label="SKILL TAGS (comma-separated)">
              <input className={inputCls} value={tags}
                onChange={(e) => setTags(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void save()}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Depth score" accent="text-primary"
          value={stats ? stats.depth_score_total : "—"} />
        <StatCard label="Wins" accent="text-success"
          value={stats ? stats.wins : "—"} />
        <StatCard label="Runner-ups" accent="text-tertiary"
          value={stats ? stats.runner_ups : "—"} />
        <StatCard label="Submissions"
          value={stats ? stats.submissions_total : "—"} />
        <StatCard label="Earned" accent="text-secondary"
          value={stats ? `${formatGen(stats.earned_total)} GEN` : "—"} />
      </div>

      {/* Proof of innovation */}
      <section className="flex flex-col gap-4">
        <h2 className="font-head text-h2 text-ink">Proof of innovation</h2>
        {work === null && <Skeleton className="h-40" />}
        {work !== null && work.length === 0 && (
          <Card className="py-8 text-center text-sm text-ink-soft">
            No evaluated work yet.
          </Card>
        )}
        {[...wonWork, ...otherWork].map((s) => (
          <Card key={s.chain_submission_id} pad={false}>
            <div className="flex items-center justify-between border-b border-line-soft bg-surface-high px-4 py-2.5">
              <span className="truncate font-mono text-label text-ink">{s.title}</span>
              <div className="flex shrink-0 items-center gap-2">
                <StatusTag status={s.status} />
                {s.evaluation && (
                  <Tag tone="text-secondary border-secondary/30 bg-secondary/10">
                    SCORE {s.evaluation.composite}
                  </Tag>
                )}
              </div>
            </div>
            <div className="p-4">
              <DiffPane
                leftTitle="THEIR RATIONALE"
                rightTitle="CONSENSUS VERDICT"
                left={<p className="line-clamp-4 italic">{s.rationale}</p>}
                right={
                  <p className="line-clamp-4">
                    {s.evaluation?.reasoning ?? "Awaiting evaluation."}
                  </p>
                }
              />
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
