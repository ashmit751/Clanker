"""
Logging configuration.
"""
import logging
import sys
from pathlib import Path


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structured logging to console and rotating file."""
    Path("logs").mkdir(exist_ok=True)

    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format=fmt,
        datefmt=datefmt,
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("logs/clanker.log", encoding="utf-8"),
        ],
    )

    # Suppress noisy third-party loggers
    for noisy in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
