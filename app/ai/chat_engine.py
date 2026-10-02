"""
Chat orchestration — ties together Ollama, context, tools, and persistence.
"""
import json
from typing import AsyncIterator
from sqlalchemy.orm import Session
from app.core.config import settings
from app.services.ollama_service import ollama_service, OllamaError
from app.services.conversation_service import conversation_service
from app.ai.context_manager import build_messages
from app.ai.tools import registry, extract_tool_calls, strip_tool_calls
from app.core.logging import get_logger

logger = get_logger(__name__)

TOOL_RESULT_PREFIX = "[Tool result]"


async def chat_stream(
    db: Session,
    conversation_id: int,
    user_message: str,
    model: str | None = None,
) -> AsyncIterator[str]:
    """
    Full chat pipeline with streaming.
    1. Save user message
    2. Build context
    3. Stream from Ollama
    4. Detect and execute tool calls mid-stream
    5. If tools were called, do a follow-up non-streaming call
    6. Save assistant response
    7. Auto-title the conversation if needed
    8. Yield text chunks to caller
    """
    model = model or settings.OLLAMA_MODEL

    # Save user message
    conversation_service.add_message(db, conversation_id, "user", user_message)

    # Get conversation history (excluding the message we just added)
    messages = conversation_service.get_messages(db, conversation_id)
    history = [
        {"role": m.role, "content": m.content}
        for m in messages[:-1]  # exclude the just-added user message
    ]

    # Build full message list with context
    ollama_messages = build_messages(db, history, user_message)

    full_response = ""
    try:
        async for chunk in ollama_service.chat_stream(model, ollama_messages):
            full_response += chunk
            yield chunk
    except OllamaError as e:
        error_msg = f"⚠️ {e}"
        conversation_service.add_message(db, conversation_id, "assistant", error_msg)
        yield f"\n\n{error_msg}"
        return

    # Check for tool calls in the response
    tool_calls = extract_tool_calls(full_response)
    if tool_calls:
        display_text = strip_tool_calls(full_response)
        tool_results = []

        for call in tool_calls:
            tool_name = call.get("tool", "")
            tool_args = call.get("args", {})
            logger.info(f"Executing tool: {tool_name} args={tool_args}")
            result = registry.execute(tool_name, tool_args, db)
            tool_results.append({"tool": tool_name, "result": result})

        # Format tool results for follow-up
        tool_result_text = json.dumps(tool_results, indent=2)
        follow_up_messages = ollama_messages + [
            {"role": "assistant", "content": full_response},
            {
                "role": "user",
                "content": (
                    f"Tool results:\n```json\n{tool_result_text}\n```\n"
                    "Now give the user a brief, natural response based on what was done."
                ),
            },
        ]

        try:
            follow_up = await ollama_service.chat_complete(model, follow_up_messages)
            final_text = (display_text + "\n\n" + follow_up).strip() if display_text else follow_up
        except OllamaError as e:
            final_text = display_text or full_response
            logger.error(f"Follow-up after tool call failed: {e}")

        # Yield the follow-up addition
        if follow_up:
            yield "\n\n" + follow_up

        conversation_service.add_message(db, conversation_id, "assistant", final_text)
    else:
        conversation_service.add_message(db, conversation_id, "assistant", full_response)

    # ── Auto-title ────────────────────────────────────────────────────────────
    # Refresh message count after saving
    all_messages = conversation_service.get_messages(db, conversation_id)
    msg_count = len(all_messages)

    # Title on 2nd message (first exchange complete), then refresh every 6 messages
    should_title = (msg_count == 2) or (msg_count > 2 and msg_count % 6 == 0)
    if should_title:
        await _auto_title(db, conversation_id, all_messages, model)


async def _auto_title(db: Session, conversation_id: int, messages: list, model: str) -> None:
    """
    Ask Ollama to produce a short conversation title (2-5 words, no punctuation).
    Runs silently after each eligible response — errors never surface to the user.
    """
    try:
        # Collect user turns only (up to 6) for a compact context snapshot
        user_turns = [m.content for m in messages if m.role == "user"][:6]
        transcript = "\n".join(f"- {t[:120]}" for t in user_turns)

        titling_messages = [
            {
                "role": "system",
                "content": (
                    "You are a conversation labeler. "
                    "Reply with ONLY a short title of 2-5 words that captures the main topic. "
                    "No quotes, no punctuation, no explanation. Just the title words."
                ),
            },
            {
                "role": "user",
                "content": f"Label this conversation:\n{transcript}",
            },
        ]

        raw = await ollama_service.chat_complete(model, titling_messages)

        # Sanitize: strip quotes/punctuation, cap at 6 words
        title = raw.strip().strip('"\'').replace("\n", " ")
        words = title.split()[:6]
        title = " ".join(words).strip(" .,!?:;-")

        if title:
            conversation_service.rename_conversation(db, conversation_id, title)
            logger.info(f"Auto-titled conversation {conversation_id}: '{title}'")

    except Exception as e:
        logger.warning(f"Auto-title failed for conversation {conversation_id}: {e}")
