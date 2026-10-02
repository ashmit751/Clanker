"""
PC action service — safe, allowlist-based open actions only.
No arbitrary shell execution. No LLM-generated commands.
"""
import subprocess
import webbrowser
import os
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.file_config import QuickAction
from app.core.logging import get_logger

logger = get_logger(__name__)


class PCActionService:
    def add_action(
        self,
        db: Session,
        name: str,
        action_type: str,
        target: str,
    ) -> QuickAction:
        if action_type not in ("folder", "url", "app"):
            raise ValueError("action_type must be 'folder', 'url', or 'app'")
        action = QuickAction(name=name, action_type=action_type, target=target)
        db.add(action)
        db.commit()
        db.refresh(action)
        return action

    def list_actions(self, db: Session) -> list[QuickAction]:
        return list(db.scalars(select(QuickAction)))

    def delete_action(self, db: Session, action_id: int) -> bool:
        action = db.get(QuickAction, action_id)
        if action:
            db.delete(action)
            db.commit()
            return True
        return False

    def execute_action(self, db: Session, action_id: int) -> dict:
        """Execute a pre-configured action by ID."""
        action = db.get(QuickAction, action_id)
        if not action:
            return {"success": False, "message": "Action not found"}

        try:
            if action.action_type == "folder":
                path = Path(action.target)
                if not path.exists():
                    return {"success": False, "message": f"Folder not found: {action.target}"}
                os.startfile(str(path))
                logger.info(f"Opened folder: {action.target}")
                return {"success": True, "message": f"Opened folder: {action.target}"}

            elif action.action_type == "url":
                webbrowser.open(action.target)
                logger.info(f"Opened URL: {action.target}")
                return {"success": True, "message": f"Opened URL: {action.target}"}

            elif action.action_type == "app":
                # Only launch pre-configured executables
                subprocess.Popen([action.target], shell=False)
                logger.info(f"Launched app: {action.target}")
                return {"success": True, "message": f"Launched: {action.target}"}

        except Exception as e:
            logger.error(f"Failed to execute action {action_id}: {e}")
            return {"success": False, "message": str(e)}

        return {"success": False, "message": "Unknown action type"}


pc_action_service = PCActionService()
