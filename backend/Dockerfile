# Reverse Spec Bounties API — production image (Fly.io)
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic.ini .
COPY migrations ./migrations

# Non-root runtime user
RUN useradd --create-home appuser
USER appuser

EXPOSE 8080
# One worker per machine: HA comes from 2 Fly machines (min_machines_running=2
# effectively via fly.toml), not from multiple workers within one machine.
# Multiple workers here would multiply indexer_loop lifespan tasks per
# machine and needlessly multiply advisory-lock contenders / DB connections.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
