"""Submission mirror registration + reads."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import current_address
from app.db.models import AuditLog, BountyMirror, SubmissionMirror
from app.db.session import get_db
from app.schemas import SubmissionMirrorIn, SubmissionOut

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("", response_model=SubmissionOut, status_code=201)
def register_submission_mirror(
    body: SubmissionMirrorIn,
    db: Session = Depends(get_db),
    address: str = Depends(current_address),
) -> SubmissionOut:
    existing = db.execute(select(SubmissionMirror).where(
        SubmissionMirror.chain_submission_id == body.chain_submission_id
    )).scalars().first()
    if existing is None:
        row = SubmissionMirror(
            chain_submission_id=body.chain_submission_id,
            chain_bounty_id=body.chain_bounty_id,
            solver_address=address,
            title=body.title,
            rationale=body.rationale,
            evidence_url=body.evidence_url,
            status="PENDING",
        )
        db.add(row)
        bounty = db.execute(select(BountyMirror).where(
            BountyMirror.chain_bounty_id == body.chain_bounty_id
        )).scalars().first()
        if bounty is not None:
            bounty.submission_count += 1
        db.add(AuditLog(actor=address, action="MIRROR_SUBMISSION",
                        payload={"chain_submission_id":
                                 body.chain_submission_id}))
        db.flush()
        existing = row
    return SubmissionOut(
        chain_submission_id=existing.chain_submission_id,
        chain_bounty_id=existing.chain_bounty_id,
        solver_address=existing.solver_address,
        title=existing.title,
        rationale=existing.rationale,
        evidence_url=existing.evidence_url,
        status=existing.status,
        evaluation=existing.evaluation,
    )


@router.get("/{chain_submission_id}", response_model=SubmissionOut)
def get_submission(chain_submission_id: int,
                   db: Session = Depends(get_db)) -> SubmissionOut:
    s = db.execute(select(SubmissionMirror).where(
        SubmissionMirror.chain_submission_id == chain_submission_id
    )).scalars().first()
    if s is None:
        raise HTTPException(404, "submission not found")
    return SubmissionOut(
        chain_submission_id=s.chain_submission_id,
        chain_bounty_id=s.chain_bounty_id,
        solver_address=s.solver_address,
        title=s.title,
        rationale=s.rationale,
        evidence_url=s.evidence_url,
        status=s.status,
        evaluation=s.evaluation,
    )
