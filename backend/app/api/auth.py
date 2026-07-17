"""Wallet authentication endpoints (nonce -> signature -> JWT)."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ratelimit import limiter
from app.core.security import (
    build_sign_message, generate_nonce, issue_jwt, recover_signer,
)
from app.db.models import AuditLog, AuthNonce, User
from app.db.session import get_db
from app.schemas import (
    NonceRequest, NonceResponse, VerifyRequest, VerifyResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/nonce", response_model=NonceResponse)
@limiter.limit(lambda: get_settings().rate_limit_auth)
def create_nonce(request: Request, body: NonceRequest,
                 db: Session = Depends(get_db)) -> NonceResponse:
    settings = get_settings()
    address = body.address.lower()
    nonce = generate_nonce()
    db.add(AuthNonce(
        wallet_address=address,
        nonce=nonce,
        expires_at=dt.datetime.now(dt.timezone.utc)
        + dt.timedelta(seconds=settings.nonce_ttl_seconds),
    ))
    return NonceResponse(
        nonce=nonce,
        message=build_sign_message(address, nonce),
        expires_in=settings.nonce_ttl_seconds,
    )


@router.post("/verify", response_model=VerifyResponse)
@limiter.limit(lambda: get_settings().rate_limit_auth)
def verify_signature(request: Request, body: VerifyRequest,
                     db: Session = Depends(get_db)) -> VerifyResponse:
    address = body.address.lower()
    now = dt.datetime.now(dt.timezone.utc)
    record = db.execute(
        select(AuthNonce)
        .where(AuthNonce.wallet_address == address,
               AuthNonce.used.is_(False),
               AuthNonce.expires_at > now)
        .order_by(AuthNonce.id.desc())
    ).scalars().first()
    if record is None:
        raise HTTPException(401, "no valid nonce; request a new one")

    message = build_sign_message(address, record.nonce)
    try:
        signer = recover_signer(message, body.signature)
    except Exception as exc:  # noqa: BLE001 — malformed signature bytes etc.
        raise HTTPException(401, "signature could not be verified") from exc
    if signer.lower() != address:
        raise HTTPException(401, "signature does not match address")

    record.used = True  # single-use: burn on success
    if db.execute(select(User).where(
            User.wallet_address == address)).scalars().first() is None:
        db.add(User(wallet_address=address))
    db.add(AuditLog(actor=address, action="SIGN_IN", payload=None))
    return VerifyResponse(token=issue_jwt(address), address=address)
