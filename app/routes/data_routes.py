"""
Memory, Task, and Project API routes.
"""
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.memory_service import memory_service
from app.services.task_service import task_service
from app.services.project_service import project_service

router = APIRouter(prefix="/api", tags=["data"])

# ─── Memory ──────────────────────────────────────────────────────────────────

class MemoryCreate(BaseModel):
    content: str
    tags: str = ""


@router.get("/memories")
def list_memories(db: Session = Depends(get_db)):
    mems = memory_service.list_all(db)
    return [{"id": m.id, "content": m.content, "tags": m.tags, "created_at": m.created_at.isoformat()} for m in mems]


@router.post("/memories")
def create_memory(req: MemoryCreate, db: Session = Depends(get_db)):
    mem = memory_service.remember(db, req.content, req.tags)
    return {"id": mem.id, "content": mem.content, "tags": mem.tags}


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: int, db: Session = Depends(get_db)):
    success = memory_service.delete(db, memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"deleted": True}


@router.get("/memories/search")
def search_memories(q: str, db: Session = Depends(get_db)):
    mems = memory_service.search(db, q)
    return [{"id": m.id, "content": m.content, "tags": m.tags} for m in mems]


# ─── Tasks ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    project_id: Optional[int] = None
    due_date: Optional[str] = None  # ISO string


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    project_id: Optional[int] = None
    due_date: Optional[str] = None


def _task_dict(t) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "project_id": t.project_id,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "created_at": t.created_at.isoformat(),
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


@router.get("/tasks")
def list_tasks(
    status: Optional[str] = "pending",
    project_id: Optional[int] = None,
    scope: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if scope == "today":
        tasks = task_service.list_today(db)
    elif scope == "overdue":
        tasks = task_service.list_overdue(db)
    else:
        tasks = task_service.list_tasks(db, status=None if status == "all" else status, project_id=project_id)
    return [_task_dict(t) for t in tasks]


@router.post("/tasks")
def create_task(req: TaskCreate, db: Session = Depends(get_db)):
    due = None
    if req.due_date:
        try:
            due = datetime.fromisoformat(req.due_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid due_date format. Use ISO 8601.")
    task = task_service.create_task(
        db, title=req.title, description=req.description,
        priority=req.priority, project_id=req.project_id, due_date=due,
    )
    return _task_dict(task)


@router.get("/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_dict(task)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, req: TaskUpdate, db: Session = Depends(get_db)):
    kwargs = {}
    if req.title is not None:
        kwargs["title"] = req.title
    if req.description is not None:
        kwargs["description"] = req.description
    if req.priority is not None:
        kwargs["priority"] = req.priority
    if req.project_id is not None:
        kwargs["project_id"] = req.project_id
    if req.due_date is not None:
        try:
            kwargs["due_date"] = datetime.fromisoformat(req.due_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid due_date")
    task = task_service.update_task(db, task_id, **kwargs)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_dict(task)


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, db: Session = Depends(get_db)):
    task = task_service.complete_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_dict(task)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    success = task_service.delete_task(db, task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"deleted": True}


# ─── Projects ────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    folder_path: str = ""
    notes: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    folder_path: Optional[str] = None
    notes: Optional[str] = None


def _project_dict(p) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "folder_path": p.folder_path,
        "notes": p.notes,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


@router.get("/projects")
def list_projects(status: Optional[str] = None, db: Session = Depends(get_db)):
    projects = project_service.list_projects(db, status=status)
    return [_project_dict(p) for p in projects]


@router.post("/projects")
def create_project(req: ProjectCreate, db: Session = Depends(get_db)):
    proj = project_service.create_project(
        db, name=req.name, description=req.description,
        folder_path=req.folder_path, notes=req.notes,
    )
    return _project_dict(proj)


@router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    proj = project_service.get_project(db, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_dict(proj)


@router.patch("/projects/{project_id}")
def update_project(project_id: int, req: ProjectUpdate, db: Session = Depends(get_db)):
    kwargs = {k: v for k, v in req.model_dump().items() if v is not None}
    proj = project_service.update_project(db, project_id, **kwargs)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_dict(proj)


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    success = project_service.delete_project(db, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": True}
