"""Pydantic request/response models — every endpoint validates both ways."""

import datetime as dt

from pydantic import BaseModel, Field, field_validator

_ADDRESS_RE = r"^0x[0-9a-fA-F]{40}$"


# --- auth --------------------------------------------------------------------

class NonceRequest(BaseModel):
    address: str = Field(pattern=_ADDRESS_RE)


class NonceResponse(BaseModel):
    nonce: str
    message: str          # exact text the wallet must sign
    expires_in: int


class VerifyRequest(BaseModel):
    address: str = Field(pattern=_ADDRESS_RE)
    signature: str = Field(min_length=100, max_length=200)


class VerifyResponse(BaseModel):
    token: str
    address: str


# --- users -------------------------------------------------------------------

class UserProfile(BaseModel):
    wallet_address: str
    display_name: str | None = None
    bio: str | None = None
    skill_tags: list[str] = []
    created_at: dt.datetime | None = None


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=1000)
    skill_tags: list[str] | None = None

    @field_validator("skill_tags")
    @classmethod
    def _cap_tags(cls, v):
        if v is not None and len(v) > 10:
            raise ValueError("at most 10 skill tags")
        return v


# --- bounty mirrors ------------------------------------------------------------

class BountyMirrorIn(BaseModel):
    """Posted by the frontend right after an on-chain create succeeds.

    The indexer later reconciles against chain state; a lying client can
    only make its own mirror temporarily wrong, never move value.
    """
    chain_bounty_id: int = Field(ge=1)
    title: str = Field(min_length=8, max_length=200)
    spec_text: str = Field(min_length=40, max_length=10000)
    true_problem_text: str = Field(default="", max_length=5000)
    category: str = Field(min_length=2, max_length=64)
    tags: list[str] = []
    reward_escrow: str = Field(pattern=r"^\d+$")
    deadline_note: str = Field(default="", max_length=48)


class BountyOut(BaseModel):
    chain_bounty_id: int
    creator_address: str
    title: str
    spec_text: str
    true_problem_text: str
    category: str
    tags: list[str]
    reward_escrow: str
    initial_escrow: str
    status: str
    deadline_note: str
    submission_window_secs: int
    opened_at: int
    submission_deadline: int
    submission_count: int
    evaluated_count: int
    winner_submission_id: int
    resolution_summary: str


class BountyPage(BaseModel):
    total: int
    items: list[BountyOut]


class SubmissionMirrorIn(BaseModel):
    chain_submission_id: int = Field(ge=1)
    chain_bounty_id: int = Field(ge=1)
    title: str = Field(min_length=8, max_length=200)
    rationale: str = Field(min_length=80, max_length=8000)
    evidence_url: str = Field(pattern=r"^https://", max_length=500)


class SubmissionOut(BaseModel):
    chain_submission_id: int
    chain_bounty_id: int
    solver_address: str
    title: str
    rationale: str
    evidence_url: str
    status: str
    evaluation: dict | None = None


# --- rewards / leaderboard -----------------------------------------------------

class RewardOut(BaseModel):
    chain_bounty_id: int
    chain_submission_id: int
    amount: str
    kind: str
    settled: bool
    recorded_at: dt.datetime


class LeaderboardRow(BaseModel):
    address: str
    display_name: str | None = None
    depth_score_total: int
    wins: int
    runner_ups: int
    submissions_total: int
    earned_total: str


# --- misc ----------------------------------------------------------------------

class HealthOut(BaseModel):
    status: str
    database: str
    indexer: str
    contract_address: str | None = None
