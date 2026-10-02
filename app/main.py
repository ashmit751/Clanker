"""
FastAPI application factory.
"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.core.database import init_db
from app.core.logging import setup_logging, get_logger
from app.core.config import settings
from app.routes import ollama_routes, chat_routes, data_routes, settings_routes, dashboard_routes

logger = get_logger(__name__)


def create_app() -> FastAPI:
    setup_logging(settings.APP_LOG_LEVEL)

    app = FastAPI(
        title="Clanker",
        description="Local AI Desktop Assistant",
        version="1.0.0",
        docs_url="/docs" if settings.APP_DEBUG else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register API routers
    app.include_router(ollama_routes.router)
    app.include_router(chat_routes.router)
    app.include_router(data_routes.router)
    app.include_router(settings_routes.router)
    app.include_router(dashboard_routes.router)

    # Serve static frontend
    static_dir = Path("frontend")
    if static_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

        @app.get("/")
        async def serve_index():
            return FileResponse(str(static_dir / "index.html"))

        @app.get("/{path:path}")
        async def serve_spa(path: str):
            file_path = static_dir / path
            if file_path.exists() and file_path.is_file():
                return FileResponse(str(file_path))
            return FileResponse(str(static_dir / "index.html"))

    @app.on_event("startup")
    async def startup():
        # Ensure required directories exist
        Path("data").mkdir(exist_ok=True)
        Path("logs").mkdir(exist_ok=True)
        Path("config").mkdir(exist_ok=True)
        init_db()
        logger.info(f"Clanker started — http://{settings.APP_HOST}:{settings.APP_PORT}")

    return app


app = create_app()
