"""
Ollama health and model API routes.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.ollama_service import ollama_service, OllamaError
from app.core.config import settings

router = APIRouter(prefix="/api/ollama", tags=["ollama"])


class ModelSelectRequest(BaseModel):
    model: str


@router.get("/health")
async def health_check():
    """Check if Ollama is running and responsive."""
    result = await ollama_service.check_health()
    return result


@router.get("/models")
async def list_models():
    """List all locally installed Ollama models."""
    try:
        models = await ollama_service.list_models()
        return {"models": models, "current": settings.OLLAMA_MODEL}
    except OllamaError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/model")
async def select_model(req: ModelSelectRequest):
    """Update the active model (persisted in memory for this session)."""
    settings.OLLAMA_MODEL = req.model
    return {"model": req.model, "message": f"Active model set to {req.model}"}


@router.get("/config")
async def get_config():
    return {
        "host": settings.OLLAMA_HOST,
        "model": settings.OLLAMA_MODEL,
        "timeout": settings.OLLAMA_TIMEOUT,
    }
