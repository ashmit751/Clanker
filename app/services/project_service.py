"""
Project service — CRUD for projects.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.project import Project
from app.core.logging import get_logger

logger = get_logger(__name__)


class ProjectService:
    def create_project(
        self,
        db: Session,
        name: str,
        description: str = "",
        folder_path: str = "",
        notes: str = "",
    ) -> Project:
        proj = Project(
            name=name,
            description=description,
            folder_path=folder_path or None,
            notes=notes,
        )
        db.add(proj)
        db.commit()
        db.refresh(proj)
        logger.info(f"Created project {proj.id}: {proj.name}")
        return proj

    def get_project(self, db: Session, project_id: int) -> Project | None:
        return db.get(Project, project_id)

    def get_by_name(self, db: Session, name: str) -> Project | None:
        stmt = select(Project).where(Project.name.ilike(f"%{name}%"))
        return db.scalars(stmt).first()

    def list_projects(self, db: Session, status: str | None = None) -> list[Project]:
        stmt = select(Project)
        if status:
            stmt = stmt.where(Project.status == status)
        stmt = stmt.order_by(Project.name)
        return list(db.scalars(stmt))

    def update_project(self, db: Session, project_id: int, **kwargs) -> Project | None:
        proj = db.get(Project, project_id)
        if proj:
            for key, value in kwargs.items():
                if hasattr(proj, key):
                    setattr(proj, key, value)
            db.commit()
            db.refresh(proj)
        return proj

    def delete_project(self, db: Session, project_id: int) -> bool:
        proj = db.get(Project, project_id)
        if proj:
            db.delete(proj)
            db.commit()
            return True
        return False


project_service = ProjectService()
