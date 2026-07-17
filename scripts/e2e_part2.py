"""E2E continuation: remaining submissions + full lifecycle on a 5th bounty.

Keys are persisted to scripts/.e2e_keys.json (gitignored) so creator
actions remain possible across runs.
"""

import json
import os
import secrets
import time

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

CONTRACT = "0xbe5E27fF832B229EE584D02b82B4606030d34F40"
GEN = 10**18
KEYS = os.path.join(os.path.dirname(__file__), ".e2e_keys.json")

if os.path.exists(KEYS):
    keys = json.load(open(KEYS))
else:
    keys = {name: "0x" + secrets.token_hex(32)
            for name in ("creator", "solver_a", "solver_b")}
    json.dump(keys, open(KEYS, "w"))

creator = create_account(keys["creator"])
solver_a = create_account(keys["solver_a"])
solver_b = create_account(keys["solver_b"])
c_creator = create_client(chain=studionet, account=creator)
c_solver_a = create_client(chain=studionet, account=solver_a)
c_solver_b = create_client(chain=studionet, account=solver_b)

print(f"creator={creator.address} solver_a={solver_a.address} "
      f"solver_b={solver_b.address}", flush=True)


def read(fn, args=None):
    return c_creator.read_contract(address=CONTRACT, function_name=fn,
                                   args=args or [])


def write(client, fn, args, value=0, label=""):
    print(f"-> {label or fn}", flush=True)
    tx = client.write_contract(address=CONTRACT, function_name=fn,
                               args=args, value=value)
    r = client.wait_for_transaction_receipt(
        transaction_hash=tx, status=TransactionStatus.ACCEPTED,
        retries=240, interval=5000)
    status = str(r.get("status_name") or r.get("status")).upper()
    print(f"   {fn}: {status}", flush=True)
    if "ACCEPTED" not in status and "FINALIZED" not in status:
        print("   RECEIPT:", str(r)[:500], flush=True)
        raise SystemExit(f"failed: {fn}")
    return r


REMAINING = [
    (2, c_solver_b,
     "GPU snapshot/restore removes the cold start instead of pre-paying for it",
     "Pre-warming is a subsidy for the symptom: serial weight loading. This "
     "submission takes the checkpoint/restore approach: initialize the model "
     "server once, snapshot full process and GPU memory state, and restore "
     "snapshots on demand in hundreds of milliseconds regardless of traffic "
     "predictability. Warm pools become unnecessary for the long tail, which "
     "is exactly where forecast-based pre-warming fails and margins die. The "
     "linked repository documents process checkpoint/restore semantics, "
     "restore-latency characteristics, and the operational constraints "
     "(driver pinning, device topology) a production rollout must respect. A "
     "per-model snapshot cache with LRU eviction then covers the top-20 "
     "target as a special case of the general solution.",
     "https://github.com/checkpoint-restore/criu"),
    (3, c_solver_a,
     "A pull-based event log with cursors makes webhook failure a non-event",
     "Retry editors and health emails accept that delivery is the platform's "
     "problem to lose. This submission inverts the model: expose the event "
     "stream as an ordered, replayable log the integrator pulls with a "
     "cursor — the pattern Kafka consumers and Stripe's /events endpoint "
     "already proved at scale. Ordering is inherent, exactly-once becomes "
     "the consumer's idempotent cursor commit, replay after an outage is "
     "just rewinding the cursor, and failure-rate alerting becomes moot "
     "because a down consumer loses nothing. Webhooks remain as an optional "
     "latency optimization, not the source of truth. The linked Kafka "
     "consumer documentation demonstrates the offset semantics, consumer "
     "group rebalancing, and replay guarantees this design imports onto the "
     "platform's existing Kafka pipeline.",
     "https://kafka.apache.org/documentation/#consumerapi"),
    (4, c_solver_b,
     "Confidence thresholds as specified, with SmartBugs benchmark harness",
     "This submission implements the specification as written: an "
     "exploitability-ranking post-processor over existing detector output, "
     "scoring findings by external call depth, state-write ordering relative "
     "to the call, and presence of reentrancy guards, with a configurable "
     "suppression threshold. The linked SmartBugs repository is the "
     "benchmark harness used to validate the target metrics, providing the "
     "labeled vulnerable-contract dataset and execution framework for "
     "measuring false-positive reduction against ground truth. No claim is "
     "made about redesigning the analyzer architecture; the goal is the "
     "specified precision improvement on the specified dataset.",
     "https://github.com/smartbugs/smartbugs"),
]


def main():
    t0 = time.time()

    # 1. Remaining submissions to the showcase bounties.
    for bounty_id, client, title, rationale, url in REMAINING:
        write(client, "submit_solution", [bounty_id, title, rationale, url],
              label=f"submit_solution -> bounty {bounty_id}")

    # 2. Fifth bounty: full lifecycle with a persisted creator key.
    write(c_creator, "create_bounty", [
        "Make our mobile app's offline mode actually trustworthy",
        "Our field-services app loses technician work when connectivity "
        "drops. Specification: add an outbox that queues failed API writes "
        "and retries them in order when the device reconnects, with a badge "
        "showing pending-sync count and a manual 'sync now' button. "
        "Deliverable: outbox module for our React Native client plus retry "
        "policy documentation. Success metric: fewer lost-work complaints "
        "from field technicians.",
        "Queued writes replayed later against changed server state cause "
        "silent conflicts — the real problem is that our data model has no "
        "notion of concurrent editing. Conflict-free replicated data types "
        "or operational transforms may be the actual fix.",
        "UX", "offline,sync,crdt,mobile", "2026-07-17", "2026-09-30",
    ], value=12_000 * GEN, label="create_bounty #5 (12,000 GEN, lifecycle)")
    stats = read("get_platform_stats")
    b5 = int(stats["bounties_total"])
    print(f"   bounty #{b5}", flush=True)

    write(c_solver_a, "submit_solution", [
        b5,
        "CRDT-based sync: conflicts become merges, not data loss",
        "An outbox faithfully replays writes into a world that has moved on; "
        "it converts connectivity loss into silent overwrites. This "
        "submission models technician edits as CRDT operations (Automerge-"
        "style JSON documents): every edit commutes, offline work merges "
        "deterministically without a central arbiter, and the pending-sync "
        "badge becomes unnecessary because there is no failure mode to "
        "count. The linked Automerge project documents the merge semantics, "
        "storage format, and React Native compatibility that make this "
        "practical for the existing client, including incremental sync over "
        "flaky links — precisely the field-services connectivity profile.",
        "https://github.com/automerge/automerge",
    ], label=f"submit_solution -> bounty {b5}")
    stats = read("get_platform_stats")
    s5 = int(stats["submissions_total"])

    # 3. Full lifecycle: close -> evaluate (REAL consensus) -> finalize -> claim.
    write(c_creator, "close_submissions", [b5])
    write(c_solver_b, "evaluate_submission", [s5],
          label=f"evaluate_submission {s5} (real web fetch + LLM consensus)")
    ev = read("get_evaluation", [s5])
    print(f"   VERDICT tier={ev['tier']} composite={ev['composite']} "
          f"depth={ev['problem_depth']} superiority={ev['superiority']} "
          f"evidence_ok={ev['evidence_fetch_ok']}", flush=True)
    print(f"   reasoning: {ev['reasoning'][:300]}", flush=True)

    write(c_creator, "finalize_bounty", [b5])
    bounty = read("get_bounty", [b5])
    print(f"   bounty {b5}: {bounty['status']} | "
          f"{bounty['resolution_summary'][:200]}", flush=True)

    claimable = int(read("get_claimable", [solver_a.address]))
    print(f"   solver_a claimable: {claimable / GEN:,.0f} GEN", flush=True)
    if claimable:
        write(c_solver_a, "claim_rewards", [], label="claim_rewards")
        print(f"   after claim: {read('get_claimable', [solver_a.address])}",
              flush=True)

    inv = read("check_escrow_invariant")
    stats = read("get_platform_stats")
    board = read("get_leaderboard", [5])
    print("\n==== FINAL STATE ====", flush=True)
    print(f"bounties={stats['bounties_total']} "
          f"submissions={stats['submissions_total']} "
          f"open_escrow={int(stats['open_escrow']) / GEN:,.0f} GEN "
          f"unclaimed={int(stats['unclaimed_rewards']) / GEN:,.0f} GEN "
          f"paid_out={int(stats['total_paid_out']) / GEN:,.0f} GEN", flush=True)
    print(f"invariant healthy={inv['healthy']}", flush=True)
    print(f"leaderboard top: {board[0] if board else 'empty'}", flush=True)
    print(f"elapsed {time.time() - t0:.0f}s", flush=True)


main()
