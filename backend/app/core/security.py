"""Wallet-signature authentication (SIWE-style) and JWT sessions.

Flow:
  1. POST /auth/nonce  -> server issues a single-use nonce bound to the
     address (5-minute TTL, stored in Postgres).
  2. The wallet signs `SIGN_MESSAGE_TEMPLATE` containing that nonce.
  3. POST /auth/verify -> server recovers the signer from the signature;
     on match it burns the nonce and issues a JWT.

The backend never sees or stores private keys. Sessions are Bearer JWTs,
so state-changing endpoints are CSRF-inert by construction.
"""

import datetime as dt
import secrets

import jwt
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

SIGN_MESSAGE_TEMPLATE = (
    "ReverseSpec sign-in\n"
    "Address: {address}\n"
    "Nonce: {nonce}\n"
    "This signature only proves wallet ownership. It costs nothing and "
    "authorizes no transaction."
)

_bearer = HTTPBearer(auto_error=False)


def generate_nonce() -> str:
    return secrets.token_hex(16)


def build_sign_message(address: str, nonce: str) -> str:
    return SIGN_MESSAGE_TEMPLATE.format(address=address.lower(), nonce=nonce)


def recover_signer(message: str, signature: str) -> str:
    """Recover the checksummed signer address; raises on garbage input."""
    encoded = encode_defunct(text=message)
    return Account.recover_message(encoded, signature=signature)


def issue_jwt(address: str) -> str:
    settings = get_settings()
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": address.lower(),
        "iat": now,
        "exp": now + dt.timedelta(hours=settings.jwt_ttl_hours),
        "iss": settings.app_name,
    }
    return jwt.encode(payload, settings.jwt_secret,
                      algorithm=settings.jwt_algorithm)


def current_address(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency: the authenticated wallet address (lowercase)."""
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail="missing bearer token")
    settings = get_settings()
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret,
                             algorithms=[settings.jwt_algorithm],
                             issuer=settings.app_name)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail=f"invalid token: {exc}") from exc
    return str(payload["sub"])
