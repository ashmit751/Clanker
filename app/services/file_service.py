"""
File service — safe read-only access to approved folders only.
"""
import os
from pathlib import Path
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.file_config import ApprovedFolder
from app.core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_EXTENSIONS = {
    ".txt", ".md", ".py", ".js", ".ts", ".tsx", ".json",
    ".html", ".css", ".sql", ".yaml", ".yml", ".toml",
    ".rst", ".csv", ".xml",
}

MAX_FILE_SIZE = 100 * 1024  # 100 KB max per file read


class FileService:
    def _get_approved_paths(self, db: Session) -> list[Path]:
        stmt = select(ApprovedFolder)
        folders = list(db.scalars(stmt))
        return [Path(f.path) for f in folders]

    def _is_approved(self, path: Path, approved: list[Path]) -> bool:
        """Check that path is inside one of the approved folders."""
        try:
            resolved = path.resolve()
            for approved_dir in approved:
                try:
                    resolved.relative_to(approved_dir.resolve())
                    return True
                except ValueError:
                    continue
        except Exception:
            pass
        return False

    def add_approved_folder(self, db: Session, path: str, label: str = "") -> ApprovedFolder:
        folder = ApprovedFolder(path=path, label=label or Path(path).name)
        db.add(folder)
        db.commit()
        db.refresh(folder)
        logger.info(f"Added approved folder: {path}")
        return folder

    def remove_approved_folder(self, db: Session, folder_id: int) -> bool:
        folder = db.get(ApprovedFolder, folder_id)
        if folder:
            db.delete(folder)
            db.commit()
            return True
        return False

    def list_approved_folders(self, db: Session) -> list[ApprovedFolder]:
        return list(db.scalars(select(ApprovedFolder)))

    def search_files(
        self,
        db: Session,
        query: str,
        extension: Optional[str] = None,
    ) -> list[dict]:
        """
        Search filenames inside approved folders.
        Returns list of {path, name, size, extension}.
        """
        approved = self._get_approved_paths(db)
        results = []
        query_lower = query.lower()

        for base in approved:
            if not base.exists():
                continue
            for root, dirs, files in os.walk(base):
                # Skip hidden dirs
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for filename in files:
                    filepath = Path(root) / filename
                    ext = filepath.suffix.lower()
                    if extension and ext != extension:
                        continue
                    if ext not in ALLOWED_EXTENSIONS:
                        continue
                    if query_lower in filename.lower():
                        try:
                            size = filepath.stat().st_size
                            results.append({
                                "path": str(filepath),
                                "name": filename,
                                "size": size,
                                "extension": ext,
                            })
                        except OSError:
                            continue
                if len(results) >= 50:
                    break

        return results[:50]

    def read_file(self, db: Session, file_path: str) -> dict:
        """
        Read a text file — only if it's inside an approved folder.
        Returns {content, path, truncated}.
        """
        path = Path(file_path)
        approved = self._get_approved_paths(db)

        if not self._is_approved(path, approved):
            raise PermissionError(f"Access denied: '{file_path}' is not in an approved folder.")

        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        if path.suffix.lower() not in ALLOWED_EXTENSIONS:
            raise ValueError(f"File type '{path.suffix}' is not supported.")

        size = path.stat().st_size
        if size > MAX_FILE_SIZE:
            # Read only first MAX_FILE_SIZE bytes
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read(MAX_FILE_SIZE)
            return {"content": content, "path": str(path), "truncated": True, "size": size}
        else:
            content = path.read_text(encoding="utf-8", errors="replace")
            return {"content": content, "path": str(path), "truncated": False, "size": size}


file_service = FileService()
