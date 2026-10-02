"""
Tool system — explicit, validated tools the AI can invoke.
The LLM suggests tool use in a structured format; the application executes them.

Protocol:
  The model outputs a special marker when it wants to call a tool:
  <TOOL_CALL>{"tool": "create_task", "args": {"title": "...", ...}}</TOOL_CALL>

  The application parses this, executes the tool, and feeds the result back.
"""
import json
import re
from datetime import datetime
from typing import Any, Callable
from sqlalchemy.orm import Session
from app.core.logging import get_logger

logger = get_logger(__name__)

TOOL_CALL_PATTERN = re.compile(r"<TOOL_CALL>(.*?)</TOOL_CALL>", re.DOTALL)


def extract_tool_calls(text: str) -> list[dict]:
    """Extract tool call JSON blocks from model output."""
    calls = []
    for match in TOOL_CALL_PATTERN.finditer(text):
        try:
            calls.append(json.loads(match.group(1).strip()))
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse tool call: {e}")
    return calls


def strip_tool_calls(text: str) -> str:
    """Remove tool call blocks from display text."""
    return TOOL_CALL_PATTERN.sub("", text).strip()


class ToolRegistry:
    """Registry of all available tools."""

    def __init__(self):
        self._tools: dict[str, Callable] = {}
        self._descriptions: dict[str, dict] = {}

    def register(self, name: str, description: str, schema: dict):
        """Decorator to register a tool."""
        def decorator(fn: Callable):
            self._tools[name] = fn
            self._descriptions[name] = {"description": description, "schema": schema}
            return fn
        return decorator

    def execute(self, name: str, args: dict, db: Session) -> dict:
        """Execute a tool by name with validated args."""
        if name not in self._tools:
            return {"error": f"Unknown tool: '{name}'. Available: {list(self._tools.keys())}"}
        try:
            return self._tools[name](db=db, **args)
        except TypeError as e:
            return {"error": f"Invalid arguments for tool '{name}': {e}"}
        except Exception as e:
            logger.error(f"Tool '{name}' failed: {e}")
            return {"error": f"Tool '{name}' failed: {e}"}

    def get_tool_descriptions_text(self) -> str:
        """Format tool descriptions for injection into the system prompt."""
        lines = ["Available tools (use when genuinely helpful):"]
        for name, meta in self._descriptions.items():
            lines.append(f"\n**{name}**: {meta['description']}")
            schema = meta['schema']
            if schema:
                lines.append(f"  Arguments: {json.dumps(schema)}")
        lines.append(
            "\nTo use a tool, output exactly: "
            "<TOOL_CALL>{\"tool\": \"tool_name\", \"args\": {...}}</TOOL_CALL>"
        )
        return "\n".join(lines)


registry = ToolRegistry()

# ─── Tool Implementations ────────────────────────────────────────────────────

@registry.register(
    "get_current_time",
    "Get the current date and time.",
    {},
)
def get_current_time(db: Session) -> dict:
    now = datetime.now()
    return {
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M"),
        "day": now.strftime("%A"),
    }


@registry.register(
    "create_task",
    "Create a new task for the user.",
    {
        "title": "string (required)",
        "description": "string (optional)",
        "priority": "low|medium|high (optional, default: medium)",
        "project_name": "string (optional)",
        "due_date": "ISO datetime string (optional, e.g. 2024-01-15T09:00:00)",
    },
)
def create_task(
    db: Session,
    title: str,
    description: str = "",
    priority: str = "medium",
    project_name: str = "",
    due_date: str = "",
) -> dict:
    from app.services.task_service import task_service
    from app.services.project_service import project_service

    project_id = None
    if project_name:
        proj = project_service.get_by_name(db, project_name)
        if proj:
            project_id = proj.id

    due = None
    if due_date:
        try:
            due = datetime.fromisoformat(due_date)
        except ValueError:
            pass

    task = task_service.create_task(
        db, title=title, description=description,
        priority=priority, project_id=project_id, due_date=due,
    )
    return {
        "success": True,
        "task_id": task.id,
        "title": task.title,
        "priority": task.priority,
        "project_id": task.project_id,
        "due_date": str(task.due_date) if task.due_date else None,
    }


@registry.register(
    "list_tasks",
    "List tasks. Optionally filter by status or project.",
    {
        "status": "pending|done|all (optional, default: pending)",
        "project_name": "string (optional)",
        "scope": "today|overdue|all (optional, default: all)",
    },
)
def list_tasks(
    db: Session,
    status: str = "pending",
    project_name: str = "",
    scope: str = "all",
) -> dict:
    from app.services.task_service import task_service
    from app.services.project_service import project_service

    project_id = None
    if project_name:
        proj = project_service.get_by_name(db, project_name)
        if proj:
            project_id = proj.id

    if scope == "today":
        tasks = task_service.list_today(db)
    elif scope == "overdue":
        tasks = task_service.list_overdue(db)
    else:
        tasks = task_service.list_tasks(db, status=None if status == "all" else status, project_id=project_id)

    return {
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "due_date": str(t.due_date) if t.due_date else None,
            }
            for t in tasks
        ],
        "count": len(tasks),
    }


@registry.register(
    "complete_task",
    "Mark a task as complete by its ID.",
    {"task_id": "integer (required)"},
)
def complete_task(db: Session, task_id: int) -> dict:
    from app.services.task_service import task_service
    task = task_service.complete_task(db, task_id)
    if task:
        return {"success": True, "task_id": task.id, "title": task.title}
    return {"success": False, "error": f"Task {task_id} not found"}


@registry.register(
    "delete_task",
    "Delete a task by its ID.",
    {"task_id": "integer (required)"},
)
def delete_task(db: Session, task_id: int) -> dict:
    from app.services.task_service import task_service
    success = task_service.delete_task(db, task_id)
    return {"success": success}


@registry.register(
    "create_project",
    "Create a new project.",
    {
        "name": "string (required)",
        "description": "string (optional)",
        "folder_path": "string (optional, local folder path)",
        "notes": "string (optional)",
    },
)
def create_project(
    db: Session,
    name: str,
    description: str = "",
    folder_path: str = "",
    notes: str = "",
) -> dict:
    from app.services.project_service import project_service
    proj = project_service.create_project(db, name=name, description=description, folder_path=folder_path, notes=notes)
    return {"success": True, "project_id": proj.id, "name": proj.name}


@registry.register(
    "list_projects",
    "List all projects.",
    {"status": "active|paused|completed|archived|all (optional, default: active)"},
)
def list_projects(db: Session, status: str = "active") -> dict:
    from app.services.project_service import project_service
    projects = project_service.list_projects(db, status=None if status == "all" else status)
    return {
        "projects": [
            {"id": p.id, "name": p.name, "status": p.status, "description": p.description}
            for p in projects
        ],
        "count": len(projects),
    }


@registry.register(
    "remember_information",
    "Store an explicit piece of information the user wants remembered long-term.",
    {
        "content": "string (required) — the information to remember",
        "tags": "string (optional) — comma-separated tags",
    },
)
def remember_information(db: Session, content: str, tags: str = "") -> dict:
    from app.services.memory_service import memory_service
    mem = memory_service.remember(db, content=content, tags=tags)
    return {"success": True, "memory_id": mem.id, "content": mem.content}


@registry.register(
    "search_memory",
    "Search stored memories for relevant information.",
    {"query": "string (required)"},
)
def search_memory(db: Session, query: str) -> dict:
    from app.services.memory_service import memory_service
    memories = memory_service.search(db, query)
    return {
        "memories": [
            {"id": m.id, "content": m.content, "tags": m.tags, "created_at": str(m.created_at)}
            for m in memories
        ],
        "count": len(memories),
    }


@registry.register(
    "delete_memory",
    "Delete a stored memory by ID.",
    {"memory_id": "integer (required)"},
)
def delete_memory(db: Session, memory_id: int) -> dict:
    from app.services.memory_service import memory_service
    success = memory_service.delete(db, memory_id)
    return {"success": success}


@registry.register(
    "search_files",
    "Search for files in approved folders by filename.",
    {
        "query": "string (required) — filename search term",
        "extension": "string (optional) — e.g. '.py', '.md'",
    },
)
def search_files(db: Session, query: str, extension: str = "") -> dict:
    from app.services.file_service import file_service
    results = file_service.search_files(db, query, extension=extension or None)
    return {"files": results, "count": len(results)}


@registry.register(
    "read_file",
    "Read the contents of a specific file (must be in an approved folder).",
    {"file_path": "string (required) — absolute path to the file"},
)
def read_file_tool(db: Session, file_path: str) -> dict:
    from app.services.file_service import file_service
    try:
        result = file_service.read_file(db, file_path)
        return result
    except PermissionError as e:
        return {"error": str(e)}
    except FileNotFoundError as e:
        return {"error": str(e)}
    except ValueError as e:
        return {"error": str(e)}


@registry.register(
    "open_action",
    "Open a configured folder, URL, or application by name.",
    {"action_name": "string (required) — name of the configured action"},
)
def open_action(db: Session, action_name: str) -> dict:
    from app.services.pc_action_service import pc_action_service
    from app.models.file_config import QuickAction
    from sqlalchemy import select
    stmt = select(QuickAction).where(QuickAction.name.ilike(f"%{action_name}%"))
    action = db.scalars(stmt).first()
    if not action:
        return {"error": f"No action found matching '{action_name}'"}
    return pc_action_service.execute_action(db, action.id)
