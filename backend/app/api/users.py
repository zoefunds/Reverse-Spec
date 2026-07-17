"""User profile endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import current_address
from app.db.models import User
from app.db.session import get_db
from app.schemas import UserProfile, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _to_profile(u: User) -> UserProfile:
    return UserProfile(
        wallet_address=u.wallet_address,
        display_name=u.display_name,
        bio=u.bio,
        skill_tags=[t for t in (u.skill_tags or "").split(",") if t],
        created_at=u.created_at,
    )


@router.get("/{address}", response_model=UserProfile)
def get_profile(address: str, db: Session = Depends(get_db)) -> UserProfile:
    u = db.execute(select(User).where(
        User.wallet_address == address.lower(),
        User.deleted_at.is_(None))).scalars().first()
    if u is None:
        # Profiles are lazily created; an unknown address is still a valid
        # on-chain participant.
        return UserProfile(wallet_address=address.lower())
    return _to_profile(u)


@router.patch("/me", response_model=UserProfile)
def update_me(body: UserUpdate, db: Session = Depends(get_db),
              address: str = Depends(current_address)) -> UserProfile:
    u = db.execute(select(User).where(
        User.wallet_address == address)).scalars().first()
    if u is None:
        raise HTTPException(404, "profile not found; sign in first")
    if body.display_name is not None:
        u.display_name = body.display_name.strip() or None
    if body.bio is not None:
        u.bio = body.bio.strip() or None
    if body.skill_tags is not None:
        u.skill_tags = ",".join(t.strip() for t in body.skill_tags
                                if t.strip())
    return _to_profile(u)
