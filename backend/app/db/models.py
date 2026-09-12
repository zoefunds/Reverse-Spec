"""SQLAlchemy models — the Postgres read-model mirroring on-chain truth.

The Intelligent Contract is authoritative for bounties, submissions,
evaluations, and rewards; these tables exist for fast querying (search,
filters, leaderboards, profiles) and are populated by the indexer plus
client-side mirrors. `users`, `auth_nonces`, and `audit_log` are
backend-native.
"""

import datetime as dt
import uuid

from sqlalchemy import (
    JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer,
    Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB

# JSONB on Postgres, plain JSON elsewhere (tests run on SQLite).
JSONType = JSON().with_variant(JSONB(), "postgresql")
# SQLite autoincrements only plain INTEGER primary keys.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True,
                                          default=uuid.uuid4)
    wallet_address: Mapped[str] = mapped_column(String(64), unique=True,
                                                index=True)
    display_name: Mapped[str | None] = mapped_column(String(80))
    bio: Mapped[str | None] = mapped_column(Text)
    skill_tags: Mapped[str | None] = mapped_column(String(300))  # csv
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow)
    deleted_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True))  # soft delete


class AuthNonce(Base):
    __tablename__ = "auth_nonces"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True,
                                    autoincrement=True)
    wallet_address: Mapped[str] = mapped_column(String(64), index=True)
    nonce: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class BountyMirror(Base):
    __tablename__ = "bounties"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True,
                                          default=uuid.uuid4)
    chain_bounty_id: Mapped[int] = mapped_column(Integer, unique=True,
                                                 index=True)
    creator_address: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(200))
    spec_text: Mapped[str] = mapped_column(Text)
    true_problem_text: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="")
    tags: Mapped[str] = mapped_column(String(300), default="")  # csv
    reward_escrow: Mapped[str] = mapped_column(Numeric(78, 0), default=0)
    initial_escrow: Mapped[str] = mapped_column(Numeric(78, 0), default=0)
    status: Mapped[str] = mapped_column(String(20), index=True,
                                        default="OPEN")
    deadline_note: Mapped[str] = mapped_column(String(48), default="")
    submission_window_secs: Mapped[int] = mapped_column(Integer, default=0)
    opened_at: Mapped[int] = mapped_column(Integer, default=0)
    submission_deadline: Mapped[int] = mapped_column(Integer, default=0)
    submission_count: Mapped[int] = mapped_column(Integer, default=0)
    evaluated_count: Mapped[int] = mapped_column(Integer, default=0)
    winner_submission_id: Mapped[int] = mapped_column(Integer, default=0)
    resolution_summary: Mapped[str] = mapped_column(Text, default="")
    synced_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("ix_bounties_status_chain_id", "status", "chain_bounty_id"),
    )


class SubmissionMirror(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True,
                                          default=uuid.uuid4)
    chain_submission_id: Mapped[int] = mapped_column(Integer, unique=True,
                                                     index=True)
    chain_bounty_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bounties.chain_bounty_id"), index=True)
    solver_address: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(200))
    rationale: Mapped[str] = mapped_column(Text)
    evidence_url: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    evaluation: Mapped[dict | None] = mapped_column(JSONType)  # full verdict
    synced_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class RewardEvent(Base):
    __tablename__ = "reward_events"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True,
                                    autoincrement=True)
    chain_bounty_id: Mapped[int] = mapped_column(Integer, index=True)
    chain_submission_id: Mapped[int] = mapped_column(Integer, default=0)
    recipient_address: Mapped[str] = mapped_column(String(64), index=True)
    amount: Mapped[str] = mapped_column(Numeric(78, 0))
    kind: Mapped[str] = mapped_column(String(24))
    settled: Mapped[bool] = mapped_column(Boolean, default=False)
    recorded_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True,
                                    autoincrement=True)
    actor: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict | None] = mapped_column(JSONType)
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True),
                                            default=_utcnow, index=True)


class IndexerState(Base):
    __tablename__ = "indexer_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | None] = mapped_column(JSONType)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
