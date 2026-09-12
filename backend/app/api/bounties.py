"""Bounty read API + client-side mirror registration."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import current_address
from app.db.models import AuditLog, BountyMirror, SubmissionMirror
from app.db.session import get_db
from app.schemas import (
    BountyMirrorIn, BountyOut, BountyPage, SubmissionOut,
)

router = APIRouter(prefix="/bounties", tags=["bounties"])


def _to_out(b: BountyMirror) -> BountyOut:
    return BountyOut(
        chain_bounty_id=b.chain_bounty_id,
        creator_address=b.creator_address,
        title=b.title,
        spec_text=b.spec_text,
        true_problem_text=b.true_problem_text,
        category=b.category,
        tags=[t for t in (b.tags or "").split(",") if t],
        reward_escrow=str(b.reward_escrow),
        initial_escrow=str(b.initial_escrow),
        status=b.status,
        deadline_note=b.deadline_note,
        submission_window_secs=b.submission_window_secs,
        opened_at=b.opened_at,
        submission_deadline=b.submission_deadline,
        submission_count=b.submission_count,
        evaluated_count=b.evaluated_count,
        winner_submission_id=b.winner_submission_id,
        resolution_summary=b.resolution_summary,
    )


@router.get("", response_model=BountyPage)
def list_bounties(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None, max_length=20),
    category: str | None = Query(default=None, max_length=64),
    q: str | None = Query(default=None, max_length=120),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
) -> BountyPage:
    stmt = select(BountyMirror)
    count_stmt = select(func.count(BountyMirror.id))
    if status:
        stmt = stmt.where(BountyMirror.status == status.upper())
        count_stmt = count_stmt.where(BountyMirror.status == status.upper())
    if category:
        stmt = stmt.where(BountyMirror.category.ilike(category))
        count_stmt = count_stmt.where(BountyMirror.category.ilike(category))
    if q:
        needle = f"%{q}%"
        cond = (BountyMirror.title.ilike(needle)
                | BountyMirror.spec_text.ilike(needle)
                | BountyMirror.tags.ilike(needle))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = db.execute(count_stmt).scalar_one()
    rows = db.execute(
        stmt.order_by(BountyMirror.chain_bounty_id.desc())
        .offset(offset).limit(limit)
    ).scalars().all()
    return BountyPage(total=total, items=[_to_out(b) for b in rows])


@router.get("/{chain_bounty_id}", response_model=BountyOut)
def get_bounty(chain_bounty_id: int,
               db: Session = Depends(get_db)) -> BountyOut:
    b = db.execute(select(BountyMirror).where(
        BountyMirror.chain_bounty_id == chain_bounty_id)).scalars().first()
    if b is None:
        raise HTTPException(404, "bounty not found (not yet indexed?)")
    return _to_out(b)


@router.get("/{chain_bounty_id}/submissions",
            response_model=list[SubmissionOut])
def get_bounty_submissions(chain_bounty_id: int,
                           db: Session = Depends(get_db)):
    rows = db.execute(select(SubmissionMirror).where(
        SubmissionMirror.chain_bounty_id == chain_bounty_id
    ).order_by(SubmissionMirror.chain_submission_id)).scalars().all()
    return [SubmissionOut(
        chain_submission_id=s.chain_submission_id,
        chain_bounty_id=s.chain_bounty_id,
        solver_address=s.solver_address,
        title=s.title,
        rationale=s.rationale,
        evidence_url=s.evidence_url,
        status=s.status,
        evaluation=s.evaluation,
    ) for s in rows]


@router.post("", response_model=BountyOut, status_code=201)
def register_bounty_mirror(
    body: BountyMirrorIn,
    db: Session = Depends(get_db),
    address: str = Depends(current_address),
) -> BountyOut:
    """Fast-path mirror written by the creator right after the on-chain tx.

    The indexer reconciles this row against contract state every cycle, so
    dishonest input self-heals; escrow amounts shown to users always come
    from chain reads.
    """
    existing = db.execute(select(BountyMirror).where(
        BountyMirror.chain_bounty_id == body.chain_bounty_id
    )).scalars().first()
    if existing is not None:
        return _to_out(existing)
    row = BountyMirror(
        chain_bounty_id=body.chain_bounty_id,
        creator_address=address,
        title=body.title,
        spec_text=body.spec_text,
        true_problem_text=body.true_problem_text,
        category=body.category,
        tags=",".join(body.tags[:6]),
        reward_escrow=body.reward_escrow,
        initial_escrow=body.reward_escrow,
        status="OPEN",
        deadline_note=body.deadline_note,
    )
    db.add(row)
    db.add(AuditLog(actor=address, action="MIRROR_BOUNTY",
                    payload={"chain_bounty_id": body.chain_bounty_id}))
    db.flush()
    return _to_out(row)
