"""Reverse Spec Bounties API — application entrypoint.

Run locally:   uvicorn app.main:app --reload --port 8000
Production:    see Dockerfile + fly.toml (always-on, health-checked).
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import auth, bounties, health, rewards, stats, submissions, users
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.ratelimit import limiter
from app.db.models import Base
from app.db.session import get_engine
from app.services.indexer import indexer_loop

logger = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    # Schema management: Alembic owns migrations in production
    # (`alembic upgrade head` runs as the Fly release command);
    # create_all is a no-op there and a convenience for fresh dev DBs.
    Base.metadata.create_all(get_engine())
    task = None
    if settings.indexer_enabled:
        task = asyncio.create_task(indexer_loop())
        logger.info("indexer started",
                    extra={"interval": settings.indexer_interval_seconds})
    yield
    if task is not None:
        task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Reverse Spec Bounties API",
        version="1.0.0",
        docs_url="/docs" if settings.environment != "production" else None,
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded,
                              _rate_limit_exceeded_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains")
        return response

    prefix = "/api/v1"
    app.include_router(auth.router, prefix=prefix)
    app.include_router(bounties.router, prefix=prefix)
    app.include_router(submissions.router, prefix=prefix)
    app.include_router(users.router, prefix=prefix)
    app.include_router(rewards.router, prefix=prefix)
    app.include_router(stats.router, prefix=prefix)
    app.include_router(health.router)  # unprefixed for Fly checks
    return app


app = create_app()
