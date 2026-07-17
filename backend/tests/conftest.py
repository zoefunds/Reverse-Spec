"""Backend test fixtures — SQLite-backed app instance, no chain access."""

import os

os.environ.update(
    DATABASE_URL="sqlite:///./test.db",
    JWT_SECRET="test-secret",
    INDEXER_ENABLED="false",
    ENVIRONMENT="development",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.db.session as db_session  # noqa: E402
from app.db.models import Base  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture()
def client():
    # Fresh database per test.
    if os.path.exists("test.db"):
        os.remove("test.db")
    db_session._engine = None
    db_session._SessionLocal = None
    Base.metadata.create_all(db_session.get_engine())
    app = create_app()
    with TestClient(app) as c:
        yield c
    if os.path.exists("test.db"):
        os.remove("test.db")
