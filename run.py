"""
Clanker - Local AI Desktop Assistant
Application entry point
"""
import uvicorn
from app.core.config import settings
from app.core.logging import setup_logging

if __name__ == "__main__":
    setup_logging()
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.APP_DEBUG,
        log_level=settings.APP_LOG_LEVEL.lower(),
    )
