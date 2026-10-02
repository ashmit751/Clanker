"""
Context manager — assembles relevant context before sending to Ollama.
Only includes information relevant to the current query.
Modular: can later be upgraded to embeddings/vector search.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.config import settings
from app.ai.tools import registry
from app.services.memory_service import memory_service
from app.services.task_service import task_service
from app.services.project_service import project_service
from app.core.logging import get_logger

logger = get_logger(__name__)


def build_system_message(db: Session, user_query: str = "") -> str:
    """
    Build the system message for this request.
    Includes: base personality, relevant memories, today's tasks summary, tool descriptions.
    """
    base_prompt = settings.get_system_prompt()
    parts = [base_prompt]

    # Current datetime
    now = datetime.now()
    parts.append(f"\n## Current Context\nDate/Time: {now.strftime('%A, %B %d, %Y — %H:%M')}")

    # Relevant memories
    if user_query:
        memories = memory_service.get_relevant(db, user_query, limit=3)
        if memories:
            parts.append("\n## Relevant Memories")
            for mem in memories:
                parts.append(f"- {mem.content}")

    # Today's tasks (brief summary)
    today_tasks = task_service.list_today(db)
    overdue_tasks = task_service.list_overdue(db)
    if today_tasks or overdue_tasks:
        parts.append("\n## Task Summary")
        if today_tasks:
            parts.append(f"Today ({len(today_tasks)} tasks): " + ", ".join(t.title for t in today_tasks[:5]))
        if overdue_tasks:
            parts.append(f"Overdue ({len(overdue_tasks)}): " + ", ".join(t.title for t in overdue_tasks[:3]))

    # Active projects (names only)
    projects = project_service.list_projects(db, status="active")
    if projects:
        parts.append("\n## Active Projects")
        parts.append(", ".join(p.name for p in projects))

    # Tool descriptions
    parts.append("\n## Tools\n" + registry.get_tool_descriptions_text())

    return "\n".join(parts)


def build_messages(
    db: Session,
    conversation_messages: list[dict],
    user_query: str,
) -> list[dict]:
    """
    Build the full message list to send to Ollama.
    System message + conversation history + new user message.
    """
    system_content = build_system_message(db, user_query)
    messages = [{"role": "system", "content": system_content}]

    # Add conversation history (last N messages to keep context window manageable)
    MAX_HISTORY = 20
    history = conversation_messages[-MAX_HISTORY:] if len(conversation_messages) > MAX_HISTORY else conversation_messages
    for msg in history:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    # Add current user message
    messages.append({"role": "user", "content": user_query})
    return messages
