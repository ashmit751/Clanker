"""
Dashboard API — aggregated data for the home screen.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.services.task_service import task_service
from app.services.project_service import project_service
from app.services.conversation_service import conversation_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(db: Session = Depends(get_db)):
    now = datetime.now()

    today_tasks = task_service.list_today(db)
    overdue_tasks = task_service.list_overdue(db)
    active_projects = project_service.list_projects(db, status="active")
    recent_conversations = conversation_service.list_conversations(db, limit=5)

    # Greeting based on time of day
    hour = now.hour
    if hour < 12:
        greeting = "Good morning"
    elif hour < 17:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"

    return {
        "greeting": greeting,
        "datetime": now.strftime("%A, %B %d, %Y — %H:%M"),
        "today_tasks": [
            {"id": t.id, "title": t.title, "priority": t.priority, "status": t.status}
            for t in today_tasks
        ],
        "overdue_tasks": [
            {"id": t.id, "title": t.title, "due_date": t.due_date.isoformat() if t.due_date else None}
            for t in overdue_tasks
        ],
        "active_projects": [
            {"id": p.id, "name": p.name, "description": p.description}
            for p in active_projects
        ],
        "recent_conversations": [
            {"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat()}
            for c in recent_conversations
        ],
        "stats": {
            "total_today_tasks": len(today_tasks),
            "total_overdue": len(overdue_tasks),
            "active_projects": len(active_projects),
        },
    }
