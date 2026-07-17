"""Liveness/readiness endpoints consumed by Fly.io health checks."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas import HealthOut
from app.services.indexer import indexer_status

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthOut)
def healthz(db: Session = Depends(get_db)) -> HealthOut:
    """Liveness + dependency snapshot. Fly restarts the machine on failure."""
    settings = get_settings()
    try:
        db.execute(text("SELECT 1"))
        db_state = "ok"
    except Exception:  # noqa: BLE001
        db_state = "down"
    return HealthOut(
        status="ok" if db_state == "ok" else "degraded",
        database=db_state,
        indexer=indexer_status().get("state", "unknown"),
        contract_address=settings.genlayer_contract_address or None,
    )


@router.get("/readyz")
def readyz(response: Response, db: Session = Depends(get_db)) -> dict:
    """Readiness: only DB matters — the API serves reads without the chain."""
    try:
        db.execute(text("SELECT 1"))
        return {"ready": True}
    except Exception:  # noqa: BLE001
        response.status_code = 503
        return {"ready": False}
