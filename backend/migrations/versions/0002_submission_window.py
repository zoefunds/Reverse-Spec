"""Add real submission-window fields to the bounty mirror.

The v1 contract enforces a real, second-precision `submission_deadline`
(computed at funding time as `opened_at + submission_window_secs`), which
is what actually gates `close_submissions`. Previously only the
cosmetic, unenforced `deadline_note` (a creator-typed date string) was
mirrored, so the product surfaced no signal at all for the real window.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bounties",
        sa.Column("submission_window_secs", sa.Integer(),
                  nullable=False, server_default="0"),
    )
    op.add_column(
        "bounties",
        sa.Column("opened_at", sa.Integer(), nullable=False,
                  server_default="0"),
    )
    op.add_column(
        "bounties",
        sa.Column("submission_deadline", sa.Integer(), nullable=False,
                  server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("bounties", "submission_deadline")
    op.drop_column("bounties", "opened_at")
    op.drop_column("bounties", "submission_window_secs")
