"""Initial schema — created from app.db.models.

Revision ID: 0001
Revises: None
"""

from alembic import op

from app.db.models import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deterministic bootstrap: create every model-defined table. Later
    # revisions use targeted alter statements.
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
