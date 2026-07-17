"""Platform stats served from the indexer's latest on-chain snapshot."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.models import IndexerState
from app.db.session import get_db

router = APIRouter(tags=["stats"])


@router.get("/stats")
def platform_stats(db: Session = Depends(get_db)) -> dict:
    """Latest `get_platform_stats` + `check_escrow_invariant` snapshots.

    Sourced from chain by the indexer every cycle; empty dicts before the
    first successful sync.
    """
    stats = db.get(IndexerState, "platform_stats")
    invariant = db.get(IndexerState, "escrow_invariant")
    return {
        "platform": stats.value if stats else None,
        "invariant": invariant.value if invariant else None,
        "synced_at": stats.updated_at.isoformat() if stats else None,
    }
