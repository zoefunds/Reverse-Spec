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
    # 0001 bootstraps from current model metadata, so a brand-new database
    # may already contain fields introduced by later migrations. Existing
    # production databases created by the original 0001 still need them.
    existing = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("bounties")
    }
    for name in ("submission_window_secs", "opened_at", "submission_deadline"):
        if name not in existing:
            op.add_column(
                "bounties",
                sa.Column(name, sa.Integer(), nullable=False, server_default="0"),
            )


def downgrade() -> None:
    op.drop_column("bounties", "submission_deadline")
    op.drop_column("bounties", "opened_at")
    op.drop_column("bounties", "submission_window_secs")
