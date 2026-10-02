"""
Settings and file/PC configuration routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.services.file_service import file_service
from app.services.pc_action_service import pc_action_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ─── Approved Folders ────────────────────────────────────────────────────────

class FolderAdd(BaseModel):
    path: str
    label: str = ""


@router.get("/folders")
def list_folders(db: Session = Depends(get_db)):
    folders = file_service.list_approved_folders(db)
    return [{"id": f.id, "path": f.path, "label": f.label} for f in folders]


@router.post("/folders")
def add_folder(req: FolderAdd, db: Session = Depends(get_db)):
    from pathlib import Path
    if not Path(req.path).exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {req.path}")
    folder = file_service.add_approved_folder(db, req.path, req.label)
    return {"id": folder.id, "path": folder.path, "label": folder.label}


@router.delete("/folders/{folder_id}")
def remove_folder(folder_id: int, db: Session = Depends(get_db)):
    success = file_service.remove_approved_folder(db, folder_id)
    if not success:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"deleted": True}


# ─── Quick Actions ───────────────────────────────────────────────────────────

class ActionCreate(BaseModel):
    name: str
    action_type: str  # folder | url | app
    target: str


@router.get("/actions")
def list_actions(db: Session = Depends(get_db)):
    actions = pc_action_service.list_actions(db)
    return [{"id": a.id, "name": a.name, "action_type": a.action_type, "target": a.target} for a in actions]


@router.post("/actions")
def create_action(req: ActionCreate, db: Session = Depends(get_db)):
    try:
        action = pc_action_service.add_action(db, req.name, req.action_type, req.target)
        return {"id": action.id, "name": action.name, "action_type": action.action_type}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/actions/{action_id}/execute")
def execute_action(action_id: int, db: Session = Depends(get_db)):
    result = pc_action_service.execute_action(db, action_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Action failed"))
    return result


@router.delete("/actions/{action_id}")
def delete_action(action_id: int, db: Session = Depends(get_db)):
    success = pc_action_service.delete_action(db, action_id)
    if not success:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"deleted": True}


# ─── App Settings ────────────────────────────────────────────────────────────

class OllamaSettingsUpdate(BaseModel):
    host: str | None = None
    model: str | None = None
    timeout: int | None = None


class SystemPromptUpdate(BaseModel):
    prompt: str


@router.get("/ollama")
def get_ollama_settings():
    return {
        "host": settings.OLLAMA_HOST,
        "model": settings.OLLAMA_MODEL,
        "timeout": settings.OLLAMA_TIMEOUT,
    }


@router.patch("/ollama")
def update_ollama_settings(req: OllamaSettingsUpdate):
    if req.host:
        settings.OLLAMA_HOST = req.host
    if req.model:
        settings.OLLAMA_MODEL = req.model
    if req.timeout:
        settings.OLLAMA_TIMEOUT = req.timeout
    return {"host": settings.OLLAMA_HOST, "model": settings.OLLAMA_MODEL, "timeout": settings.OLLAMA_TIMEOUT}


@router.get("/system-prompt")
def get_system_prompt():
    return {"prompt": settings.get_system_prompt()}


@router.patch("/system-prompt")
def update_system_prompt(req: SystemPromptUpdate):
    from pathlib import Path
    path = Path(settings.SYSTEM_PROMPT_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(req.prompt, encoding="utf-8")
    return {"saved": True}


# ─── File Search ─────────────────────────────────────────────────────────────

@router.get("/search-files")
def search_files(q: str, ext: str = "", db: Session = Depends(get_db)):
    results = file_service.search_files(db, q, extension=ext or None)
    return results


@router.get("/read-file")
def read_file(path: str, db: Session = Depends(get_db)):
    try:
        return file_service.read_file(db, path)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
