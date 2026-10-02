"""
Conversation service — CRUD for conversations and messages.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.conversation import Conversation, Message
from app.core.logging import get_logger

logger = get_logger(__name__)


class ConversationService:
    def create_conversation(self, db: Session, title: str = "New Conversation") -> Conversation:
        conv = Conversation(title=title)
        db.add(conv)
        db.commit()
        db.refresh(conv)
        logger.info(f"Created conversation {conv.id}: {conv.title}")
        return conv

    def get_conversation(self, db: Session, conversation_id: int) -> Conversation | None:
        return db.get(Conversation, conversation_id)

    def list_conversations(self, db: Session, limit: int = 50) -> list[Conversation]:
        from sqlalchemy import select
        stmt = select(Conversation).order_by(Conversation.updated_at.desc()).limit(limit)
        return list(db.scalars(stmt))

    def rename_conversation(self, db: Session, conversation_id: int, title: str) -> Conversation | None:
        conv = db.get(Conversation, conversation_id)
        if conv:
            conv.title = title
            conv.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(conv)
        return conv

    def delete_conversation(self, db: Session, conversation_id: int) -> bool:
        conv = db.get(Conversation, conversation_id)
        if conv:
            db.delete(conv)
            db.commit()
            logger.info(f"Deleted conversation {conversation_id}")
            return True
        return False

    def add_message(
        self,
        db: Session,
        conversation_id: int,
        role: str,
        content: str,
    ) -> Message:
        msg = Message(conversation_id=conversation_id, role=role, content=content)
        db.add(msg)
        # Update conversation timestamp
        conv = db.get(Conversation, conversation_id)
        if conv:
            conv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(msg)
        return msg

    def get_messages(self, db: Session, conversation_id: int) -> list[Message]:
        from sqlalchemy import select
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
        return list(db.scalars(stmt))

    def clear_conversation(self, db: Session, conversation_id: int) -> bool:
        from sqlalchemy import delete
        db.execute(delete(Message).where(Message.conversation_id == conversation_id))
        conv = db.get(Conversation, conversation_id)
        if conv:
            conv.updated_at = datetime.utcnow()
        db.commit()
        return True


conversation_service = ConversationService()
