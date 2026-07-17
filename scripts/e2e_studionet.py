"""End-to-end protocol test against the DEPLOYED StudioNet contract.

Exercises every flow the website exposes, with realistic professional
content: create 4 funded bounties (10k-50k GEN), submit solutions with
real public evidence URLs, close, run consensus evaluations (real LLM +
real web fetch on StudioNet validators), finalize payouts, claim rewards,
and verify the escrow invariant end to end.

Run:  .venv/bin/python scripts/e2e_studionet.py
"""

import sys
import time

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

CONTRACT = "0xbe5E27fF832B229EE584D02b82B4606030d34F40"
GEN = 10**18

creator = create_account()
solver_a = create_account()
solver_b = create_account()

c_creator = create_client(chain=studionet, account=creator)
c_solver_a = create_client(chain=studionet, account=solver_a)
c_solver_b = create_client(chain=studionet, account=solver_b)
c_read = c_creator

print(f"creator : {creator.address}")
print(f"solver_a: {solver_a.address}")
print(f"solver_b: {solver_b.address}")


def read(fn, args=None):
    return c_read.read_contract(address=CONTRACT, function_name=fn,
                                args=args or [])


def write(client, fn, args, value=0, label=""):
    print(f"→ {label or fn} ...", flush=True)
    tx = client.write_contract(address=CONTRACT, function_name=fn,
                               args=args, value=value)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx, status=TransactionStatus.ACCEPTED,
        retries=200, interval=5000)
    status = receipt.get("status_name") or receipt.get("status")
    result = (receipt.get("consensus_data") or {}).get("leader_receipt")
    ok = "ACCEPTED" in str(status).upper() or "FINALIZED" in str(status).upper()
    print(f"  {fn}: status={status} ok={ok}", flush=True)
    if not ok:
        print(f"  RECEIPT: {str(receipt)[:600]}")
        raise SystemExit(f"transaction failed: {fn}")
    return receipt


BOUNTIES = [
    dict(
        title="Eliminate MEV sandwich losses for retail swaps on our DEX aggregator",
        spec=(
            "Our DEX aggregator routes ~$40M/month of retail volume. Users complain "
            "about slippage. Specification: implement a dynamic slippage-tolerance "
            "widget that recommends a tolerance per pair based on 24h volatility, "
            "with presets (0.1%, 0.5%, 1%) and a warning banner when the user sets "
            "tolerance above 2%. Deliverable: React widget + volatility API. "
            "Success metric: fewer support tickets mentioning slippage."
        ),
        true_problem=(
            "Slippage settings are a symptom. The real losses come from MEV "
            "sandwich attacks that exploit whatever tolerance users set. A better "
            "solution likely involves private orderflow, batch auctions, or "
            "intent-based routing rather than a smarter slider."
        ),
        category="DeFi",
        tags="mev,dex,orderflow,slippage",
        escrow=50_000 * GEN,
        deadline="2026-09-15",
    ),
    dict(
        title="Cut cold-start latency for our serverless inference platform below 400ms",
        spec=(
            "Our GPU serverless platform cold-starts LLM inference containers in "
            "6-14s. Specification: build a container image pre-warming scheduler "
            "that keeps N warm replicas per model based on a 7-day traffic "
            "forecast, exposing warm-pool size as a tenant-configurable knob with "
            "per-minute billing. Deliverable: scheduler service + Grafana "
            "dashboard. Target: p95 time-to-first-token under 400ms for the top "
            "20 models."
        ),
        true_problem=(
            "Pre-warming burns GPU-hours on idle replicas and only helps "
            "predictable traffic. The deeper problem is that model weights load "
            "serially from object storage into GPU memory. Snapshot/restore of "
            "initialized processes, weight streaming, or GPU memory pooling "
            "could remove the cold start itself instead of paying to hide it."
        ),
        category="Infra",
        tags="serverless,gpu,latency,inference",
        escrow=35_000 * GEN,
        deadline="2026-09-01",
    ),
    dict(
        title="Stop customer churn caused by our webhook delivery failures",
        spec=(
            "Integrators churn after webhook incidents. Specification: add a "
            "retry policy editor (exponential backoff, max 24h), a per-endpoint "
            "health page showing delivery success rate, and email alerts to "
            "integrators when their endpoint failure rate exceeds 5% over 15 "
            "minutes. Deliverable: dashboard pages + alerting worker on our "
            "existing Kafka pipeline."
        ),
        true_problem=(
            "Retries and alerts manage failure after the fact. Integrators "
            "actually churn because webhook consumption is inherently fragile: "
            "ordering, exactly-once, and replay are all pushed onto every "
            "customer. A pull-based event log API (cursor + replay), or signed "
            "event bundles with idempotency keys, might remove the failure "
            "class entirely."
        ),
        category="Tooling",
        tags="webhooks,reliability,events,api-design",
        escrow=18_000 * GEN,
        deadline="2026-08-30",
    ),
    dict(
        title="Reduce false positives in our smart-contract audit scanner",
        spec=(
            "Our static analyzer flags ~38% false positives on reentrancy and "
            "integer-overflow detectors, drowning auditors. Specification: add a "
            "post-processing filter that ranks findings by exploitability "
            "heuristics (external call depth, state-write ordering, guard "
            "presence) and suppresses findings below a configurable confidence "
            "threshold. Deliverable: filter module + benchmark on the SmartBugs "
            "dataset showing <15% FP with <2% missed true positives."
        ),
        true_problem=(
            "Ranking heuristics tune the noise but keep the architecture that "
            "produces it: pattern-matching without execution semantics. Concolic "
            "execution of only the flagged paths, or LLM-assisted triage with "
            "counterexample generation, could verify exploitability instead of "
            "guessing at it."
        ),
        category="Security",
        tags="audit,static-analysis,solidity,tooling",
        escrow=10_000 * GEN,
        deadline="2026-10-01",
    ),
]

SUBMISSIONS = [
    # (bounty_idx, client, title, rationale, evidence_url)
    (
        0, "a",
        "Batch auctions via CoW-style intent settlement, not a smarter slider",
        (
            "The spec optimizes the size of the victim's mistake; sandwiching "
            "survives any tolerance the user picks because the mempool leaks "
            "intent. This submission replaces public swap transactions with "
            "signed intents settled in uniform-clearing-price batch auctions, "
            "following the CoW Protocol model: solvers compete off-chain, all "
            "trades in a batch clear at one price, and there is no ordering "
            "advantage to extract. Retail flow becomes structurally "
            "unsandwichable — the attack class disappears rather than being "
            "tuned. The linked protocol documentation and open-source "
            "settlement contracts demonstrate the full mechanism in production "
            "at scale, including solver competition, EIP-712 intent format, "
            "and uniform clearing price computation that we would adapt to "
            "the aggregator's routing layer."
        ),
        "https://docs.cow.fi/cow-protocol/concepts/introduction/batch-auctions",
    ),
    (
        1, "b",
        "GPU snapshot/restore removes the cold start instead of pre-paying for it",
        (
            "Pre-warming is a subsidy for the symptom: serial weight loading. "
            "This submission takes the checkpoint/restore approach  proven by CRIU-gpu "
            "style systems: initialize the model server once, snapshot full "
            "process + GPU memory state, and restore snapshots on demand in "
            "hundreds of milliseconds regardless of traffic predictability. "
            "Warm pools become unnecessary for the long tail, which is exactly "
            "where pre-warming forecasts fail and margins die. The linked "
            "repository documents process checkpoint/restore including GPU "
            "state handling, the restore-latency characteristics, and the "
            "operational constraints (driver pinning, device topology) that a "
            "production rollout must respect. A per-model snapshot cache with "
            "LRU eviction covers the top-20 target as a special case of the "
            "general solution."
        ),
        "https://github.com/checkpoint-restore/criu",
    ),
    (
        2, "a",
        "A pull-based event log with cursors makes webhook failure a non-event",
        (
            "Retry editors and health emails accept that delivery is the "
            "platform's problem to lose. This submission inverts the model: "
            "expose the event stream as an ordered, replayable log the "
            "integrator pulls with a cursor — the pattern Kafka consumers and "
            "Stripe's /events endpoint already proved. Ordering is inherent, "
            "exactly-once becomes the consumer's idempotent cursor commit, "
            "replay after an outage is 'rewind the cursor', and the 5% "
            "failure-rate alerting becomes unnecessary because a down consumer "
            "loses nothing. Webhooks remain as an optional latency "
            "optimization, not the source of truth. The linked Kafka consumer "
            "documentation demonstrates the offset/cursor semantics, consumer "
            "group rebalancing, and replay guarantees this design imports "
            "wholesale onto the existing Kafka pipeline the platform already "
            "runs."
        ),
        "https://kafka.apache.org/documentation/#consumerapi",
    ),
    (
        3, "b",
        "Confidence thresholds as specified, with SmartBugs benchmark harness",
        (
            "This submission implements the specification as written: an "
            "exploitability-ranking post-processor over the existing detector "
            "output, scoring findings by external call depth, state-write "
            "ordering relative to the call, and presence of reentrancy guards, "
            "with a configurable suppression threshold. The linked SmartBugs "
            "repository is the benchmark harness used to validate the target "
            "metrics, providing the labeled vulnerable-contract dataset and "
            "execution framework for measuring false-positive reduction "
            "against ground truth. No claim is made about redesigning the "
            "analyzer architecture; the goal is the specified precision "
            "improvement on the specified dataset."
        ),
        "https://github.com/smartbugs/smartbugs",
    ),
]


def main() -> None:
    t0 = time.time()
    cfg = read("get_config")
    print(f"contract config ok — win_threshold={cfg['win_threshold']}")

    # ---- 1. create 4 bounties (payable escrow) -----------------------------
    bounty_ids = []
    for b in BOUNTIES:
        write(c_creator, "create_bounty",
              [b["title"], b["spec"], b["true_problem"], b["category"],
               b["tags"], "2026-07-17", b["deadline"]],
              value=b["escrow"],
              label=f"create_bounty '{b['title'][:48]}…' "
                    f"({b['escrow'] // GEN:,} GEN)")
        stats = read("get_platform_stats")
        bounty_ids.append(int(stats["bounties_total"]))
        print(f"  bounty id={bounty_ids[-1]} open_escrow="
              f"{int(stats['open_escrow']) // GEN:,} GEN")

    inv = read("check_escrow_invariant")
    print(f"invariant after funding: healthy={inv['healthy']} "
          f"open={int(inv['open_escrow']) // GEN:,} GEN")

    # ---- 2. submissions -----------------------------------------------------
    submission_ids = {}
    for idx, who, title, rationale, url in SUBMISSIONS:
        client = c_solver_a if who == "a" else c_solver_b
        write(client, "submit_solution",
              [bounty_ids[idx], title, rationale, url],
              label=f"submit_solution → bounty {bounty_ids[idx]}")
        stats = read("get_platform_stats")
        submission_ids[(idx, who)] = int(stats["submissions_total"])
        print(f"  submission id={submission_ids[(idx, who)]}")

    # ---- 3. lifecycle on bounty #1: close → evaluate → finalize → claim ----
    target = bounty_ids[0]
    target_sub = submission_ids[(0, "a")]
    write(c_creator, "close_submissions", [target])
    print("→ evaluate_submission (REAL consensus: web fetch + LLM)…")
    write(c_solver_b, "evaluate_submission", [target_sub],
          label=f"evaluate_submission {target_sub}")
    ev = read("get_evaluation", [target_sub])
    print(f"  VERDICT tier={ev['tier']} composite={ev['composite']} "
          f"depth={ev['problem_depth']} fetch_ok={ev['evidence_fetch_ok']}")
    print(f"  reasoning: {ev['reasoning'][:220]}…")

    write(c_creator, "finalize_bounty", [target])
    bounty = read("get_bounty", [target])
    print(f"  bounty {target}: {bounty['status']} — "
          f"{bounty['resolution_summary'][:160]}")

    claimable = int(read("get_claimable", [solver_a.address]))
    print(f"  solver_a claimable: {claimable // GEN:,} GEN")
    if claimable > 0:
        write(c_solver_a, "claim_rewards", [], label="claim_rewards (solver_a)")
        after = int(read("get_claimable", [solver_a.address]))
        print(f"  claimable after claim: {after}")

    # ---- 4. final state -----------------------------------------------------
    inv = read("check_escrow_invariant")
    stats = read("get_platform_stats")
    print("\n==== FINAL STATE ====")
    print(f"bounties={stats['bounties_total']} "
          f"submissions={stats['submissions_total']} "
          f"open_escrow={int(stats['open_escrow']) // GEN:,} GEN "
          f"unclaimed={int(stats['unclaimed_rewards']) // GEN:,} GEN")
    print(f"invariant healthy={inv['healthy']}")
    print(f"elapsed: {time.time() - t0:.0f}s")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
