"""Structured JSON logging — one line per event, Fly-logs friendly."""

import logging
import sys

from pythonjsonlogger.json import JsonFormatter

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"
    ))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
    # Quiet noisy libraries without hiding real errors.
    for noisy in ("uvicorn.access", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
