"""Rewards history + leaderboard (read model)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import RewardEvent, SubmissionMirror, User
from app.db.session import get_db
from app.schemas import LeaderboardRow, RewardOut

router = APIRouter(tags=["rewards"])


@router.get("/rewards/{address}", response_model=list[RewardOut])
def get_rewards(address: str, db: Session = Depends(get_db),
                limit: int = Query(default=50, ge=1, le=100)):
    rows = db.execute(
        select(RewardEvent)
        .where(RewardEvent.recipient_address == address.lower())
        .order_by(RewardEvent.id.desc()).limit(limit)
    ).scalars().all()
    return [RewardOut(
        chain_bounty_id=r.chain_bounty_id,
        chain_submission_id=r.chain_submission_id,
        amount=str(r.amount),
        kind=r.kind,
        settled=r.settled,
        recorded_at=r.recorded_at,
    ) for r in rows]


@router.get("/leaderboard", response_model=list[LeaderboardRow])
def leaderboard(db: Session = Depends(get_db),
                limit: int = Query(default=25, ge=1, le=100)):
    """Aggregates solver performance from indexed submissions/evaluations."""
    subs = db.execute(select(SubmissionMirror)).scalars().all()
    per: dict[str, dict] = {}
    for s in subs:
        row = per.setdefault(s.solver_address, {
            "depth": 0, "wins": 0, "runner_ups": 0, "total": 0, "earned": 0,
        })
        row["total"] += 1
        if s.status == "WINNER":
            row["wins"] += 1
        elif s.status == "RUNNER_UP":
            row["runner_ups"] += 1
        if s.evaluation and isinstance(s.evaluation, dict):
            row["depth"] += int(s.evaluation.get("problem_depth", 0))
    rewards = db.execute(select(RewardEvent)).scalars().all()
    for r in rewards:
        if r.kind in ("WIN", "RUNNER_UP") and r.recipient_address in per:
            per[r.recipient_address]["earned"] += int(r.amount)
    names = {u.wallet_address: u.display_name for u in
             db.execute(select(User)).scalars().all()}
    ranked = sorted(per.items(),
                    key=lambda kv: (-kv[1]["depth"], -kv[1]["wins"], kv[0]))
    return [LeaderboardRow(
        address=addr,
        display_name=names.get(addr),
        depth_score_total=row["depth"],
        wins=row["wins"],
        runner_ups=row["runner_ups"],
        submissions_total=row["total"],
        earned_total=str(row["earned"]),
    ) for addr, row in ranked[:limit]]
