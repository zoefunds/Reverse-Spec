"""Contract indexer — mirrors on-chain state into Postgres.

Runs as an asyncio background task inside the API process (one Fly machine
is the whole deployment unit; a crash of either component restarts both via
Fly health checks — that is the availability model, keep it simple).

Every cycle it:
  1. reads `get_platform_stats` + `check_escrow_invariant` (health signal),
  2. pages through `get_bounty_page` and upserts bounty mirrors,
  3. pulls submissions for bounties that changed and upserts them with
     their evaluations,
  4. records reward ledger entries from `get_reward_history` for every
     address it has seen.

All chain reads go through genlayer-py. Failures never propagate: the
indexer logs, marks itself degraded, and retries next cycle — the API stays
up regardless (the 24/7 requirement).
"""

import asyncio
import datetime as dt
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.models import (
    BountyMirror, IndexerState, RewardEvent, SubmissionMirror,
)
from app.db.session import get_engine

logger = get_logger("indexer")

_status: dict[str, Any] = {"state": "starting", "last_ok": None,
                           "last_error": None}


def indexer_status() -> dict:
    return dict(_status)


def _make_client():
    """Create a genlayer-py read client for the configured network."""
    from genlayer_py import create_account, create_client
    settings = get_settings()
    if settings.genlayer_network == "localnet":
        from genlayer_py.chains import localnet as chain
    else:
        from genlayer_py.chains import studionet as chain
    # genlayer-py requires an attached account even for view calls; an
    # ephemeral unfunded account is fine — reads are gasless and this
    # client never signs value-bearing transactions.
    return create_client(chain=chain, account=create_account())


def _read(client, function_name: str, args: list) -> Any:
    settings = get_settings()
    return client.read_contract(
        address=settings.genlayer_contract_address,
        function_name=function_name,
        args=args,
    )


def _upsert_bounty(db: Session, data: dict) -> bool:
    """Insert/update one bounty mirror. Returns True when row changed."""
    row = db.execute(select(BountyMirror).where(
        BountyMirror.chain_bounty_id == int(data["id"]))).scalars().first()
    if row is None:
        row = BountyMirror(chain_bounty_id=int(data["id"]))
        db.add(row)
    changed = (row.status != data["status"]
               or row.submission_count != int(data["submission_count"])
               or row.evaluated_count != int(data["evaluated_count"]))
    row.creator_address = str(data["creator"]).lower()
    row.title = data["title"]
    row.spec_text = data["spec_text"]
    row.true_problem_text = data.get("true_problem_text", "")
    row.category = data.get("category", "")
    row.tags = ",".join(data.get("tags", []))
    row.reward_escrow = int(data["reward_escrow"])
    row.initial_escrow = int(data["initial_escrow"])
    row.status = data["status"]
    row.deadline_note = data.get("deadline_note", "")
    row.submission_count = int(data["submission_count"])
    row.evaluated_count = int(data["evaluated_count"])
    row.winner_submission_id = int(data.get("winner_submission_id", 0))
    row.resolution_summary = data.get("resolution_summary", "")
    return changed


def _upsert_submissions(db: Session, client, chain_bounty_id: int) -> None:
    subs = _read(client, "get_bounty_submissions", [chain_bounty_id]) or []
    for data in subs:
        row = db.execute(select(SubmissionMirror).where(
            SubmissionMirror.chain_submission_id == int(data["id"])
        )).scalars().first()
        if row is None:
            row = SubmissionMirror(chain_submission_id=int(data["id"]))
            db.add(row)
        row.chain_bounty_id = int(data["bounty_id"])
        row.solver_address = str(data["solver"]).lower()
        row.title = data["title"]
        row.rationale = data["rationale"]
        row.evidence_url = data["evidence_url"]
        row.status = data["status"]
        row.evaluation = data.get("evaluation")


def _sync_rewards(db: Session, client) -> None:
    """Mirror the reward ledger for every address seen in submissions."""
    addresses = {r[0] for r in db.execute(
        select(SubmissionMirror.solver_address)).all()}
    addresses |= {r[0] for r in db.execute(
        select(BountyMirror.creator_address)).all()}
    for address in addresses:
        try:
            entries = _read(client, "get_reward_history", [address, 100]) or []
        except Exception:  # noqa: BLE001 — one bad address must not stop sync
            continue
        for e in entries:
            exists = db.execute(select(RewardEvent).where(
                RewardEvent.recipient_address == address,
                RewardEvent.chain_bounty_id == int(e["bounty_id"]),
                RewardEvent.kind == e["kind"],
                RewardEvent.amount == int(e["amount"]),
            )).scalars().first()
            if exists is None:
                db.add(RewardEvent(
                    chain_bounty_id=int(e["bounty_id"]),
                    chain_submission_id=int(e["submission_id"]),
                    recipient_address=address,
                    amount=int(e["amount"]),
                    kind=e["kind"],
                    settled=bool(e["settled"]),
                ))
            elif exists.settled != bool(e["settled"]):
                exists.settled = bool(e["settled"])


def run_cycle() -> None:
    """One full sync cycle (synchronous; called from the async loop)."""
    from sqlalchemy.orm import sessionmaker
    settings = get_settings()
    if not settings.genlayer_contract_address:
        _status.update(state="idle",
                       last_error="no contract address configured")
        return
    client = _make_client()
    SessionLocal = sessionmaker(bind=get_engine())
    with SessionLocal() as db:
        stats = _read(client, "get_platform_stats", [])
        invariant = _read(client, "check_escrow_invariant", [])
        db.merge(IndexerState(key="platform_stats", value=stats))
        db.merge(IndexerState(key="escrow_invariant", value=invariant))
        if invariant and not invariant.get("healthy", True):
            logger.error("ESCROW INVARIANT VIOLATION reported by contract",
                         extra={"invariant": invariant})
        total = int(stats.get("bounties_total", 0)) if stats else 0
        offset = 0
        changed_bounties: list[int] = []
        while offset < total:
            page = _read(client, "get_bounty_page", [offset, 50])
            for item in page.get("items", []):
                if _upsert_bounty(db, item):
                    changed_bounties.append(int(item["id"]))
            offset += 50
        for bounty_id in changed_bounties:
            _upsert_submissions(db, client, bounty_id)
        _sync_rewards(db, client)
        db.commit()
    _status.update(state="healthy",
                   last_ok=dt.datetime.now(dt.timezone.utc).isoformat(),
                   last_error=None)


async def indexer_loop() -> None:
    """Forever loop with jittered backoff; never lets an exception escape."""
    settings = get_settings()
    while True:
        try:
            await asyncio.to_thread(run_cycle)
        except Exception as exc:  # noqa: BLE001 — indexer must never die
            _status.update(state="degraded", last_error=str(exc)[:300])
            logger.warning("indexer cycle failed", extra={"error": str(exc)})
        await asyncio.sleep(settings.indexer_interval_seconds)
