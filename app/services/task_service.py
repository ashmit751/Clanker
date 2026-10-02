"""
Task service — CRUD for tasks.
"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.task import Task
from app.core.logging import get_logger

logger = get_logger(__name__)


class TaskService:
    def create_task(
        self,
        db: Session,
        title: str,
        description: str = "",
        priority: str = "medium",
        project_id: Optional[int] = None,
        due_date: Optional[datetime] = None,
    ) -> Task:
        task = Task(
            title=title,
            description=description,
            priority=priority,
            project_id=project_id,
            due_date=due_date,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        logger.info(f"Created task {task.id}: {task.title}")
        return task

    def get_task(self, db: Session, task_id: int) -> Task | None:
        return db.get(Task, task_id)

    def list_tasks(
        self,
        db: Session,
        status: Optional[str] = None,
        project_id: Optional[int] = None,
    ) -> list[Task]:
        stmt = select(Task).where(Task.status != "deleted")
        if status:
            stmt = stmt.where(Task.status == status)
        if project_id:
            stmt = stmt.where(Task.project_id == project_id)
        stmt = stmt.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
        return list(db.scalars(stmt))

    def list_today(self, db: Session) -> list[Task]:
        today = date.today()
        stmt = (
            select(Task)
            .where(Task.status == "pending")
            .where(Task.due_date >= datetime.combine(today, datetime.min.time()))
            .where(Task.due_date < datetime.combine(today, datetime.max.time()))
            .order_by(Task.priority.desc(), Task.created_at)
        )
        return list(db.scalars(stmt))

    def list_overdue(self, db: Session) -> list[Task]:
        now = datetime.utcnow()
        stmt = (
            select(Task)
            .where(Task.status == "pending")
            .where(Task.due_date < now)
            .order_by(Task.due_date)
        )
        return list(db.scalars(stmt))

    def complete_task(self, db: Session, task_id: int) -> Task | None:
        task = db.get(Task, task_id)
        if task:
            task.status = "done"
            task.completed_at = datetime.utcnow()
            db.commit()
            db.refresh(task)
            logger.info(f"Completed task {task_id}")
        return task

    def delete_task(self, db: Session, task_id: int) -> bool:
        task = db.get(Task, task_id)
        if task:
            task.status = "deleted"
            db.commit()
            return True
        return False

    def update_task(
        self,
        db: Session,
        task_id: int,
        **kwargs,
    ) -> Task | None:
        task = db.get(Task, task_id)
        if task:
            for key, value in kwargs.items():
                if hasattr(task, key) and value is not None:
                    setattr(task, key, value)
            db.commit()
            db.refresh(task)
        return task


task_service = TaskService()
