"""
Chat API routes — conversation management and streaming chat.
"""
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.conversation_service import conversation_service
from app.ai.chat_engine import chat_stream
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class CreateConversationRequest(BaseModel):
    title: str = "New Conversation"


class RenameConversationRequest(BaseModel):
    title: str


class SendMessageRequest(BaseModel):
    message: str
    model: Optional[str] = None


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db)):
    convs = conversation_service.list_conversations(db)
    return [
        {
            "id": c.id,
            "title": c.title,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
            "message_count": len(c.messages),
        }
        for c in convs
    ]


@router.post("/conversations")
def create_conversation(req: CreateConversationRequest, db: Session = Depends(get_db)):
    conv = conversation_service.create_conversation(db, req.title)
    return {"id": conv.id, "title": conv.title, "created_at": conv.created_at.isoformat()}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    conv = conversation_service.get_conversation(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in conv.messages
        ],
    }


@router.patch("/conversations/{conversation_id}/rename")
def rename_conversation(
    conversation_id: int,
    req: RenameConversationRequest,
    db: Session = Depends(get_db),
):
    conv = conversation_service.rename_conversation(db, conversation_id, req.title)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"id": conv.id, "title": conv.title}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    success = conversation_service.delete_conversation(db, conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@router.delete("/conversations/{conversation_id}/messages")
def clear_conversation(conversation_id: int, db: Session = Depends(get_db)):
    conversation_service.clear_conversation(db, conversation_id)
    return {"cleared": True}


@router.post("/conversations/{conversation_id}/send")
async def send_message(
    conversation_id: int,
    req: SendMessageRequest,
    db: Session = Depends(get_db),
):
    """Stream a chat response using Server-Sent Events."""
    conv = conversation_service.get_conversation(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    async def event_generator():
        try:
            async for chunk in chat_stream(db, conversation_id, req.message, req.model):
                # SSE format
                escaped = chunk.replace("\n", "\\n")
                yield f"data: {escaped}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: [ERROR] {e}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
