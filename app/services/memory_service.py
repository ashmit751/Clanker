"""
Memory service — explicit user-directed memory only.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.memory import Memory
from app.core.logging import get_logger

logger = get_logger(__name__)


class MemoryService:
    def remember(self, db: Session, content: str, tags: str = "") -> Memory:
        mem = Memory(content=content, tags=tags)
        db.add(mem)
        db.commit()
        db.refresh(mem)
        logger.info(f"Stored memory {mem.id}")
        return mem

    def search(self, db: Session, query: str, limit: int = 5) -> list[Memory]:
        """Simple keyword search across memory content."""
        stmt = (
            select(Memory)
            .where(Memory.content.ilike(f"%{query}%"))
            .order_by(Memory.created_at.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt))

    def list_all(self, db: Session) -> list[Memory]:
        stmt = select(Memory).order_by(Memory.created_at.desc())
        return list(db.scalars(stmt))

    def delete(self, db: Session, memory_id: int) -> bool:
        mem = db.get(Memory, memory_id)
        if mem:
            db.delete(mem)
            db.commit()
            logger.info(f"Deleted memory {memory_id}")
            return True
        return False

    def get_relevant(self, db: Session, query: str, limit: int = 3) -> list[Memory]:
        """Get memories most relevant to a query (keyword match for Phase 1)."""
        if not query:
            return []
        words = [w for w in query.lower().split() if len(w) > 3]
        if not words:
            return self.list_all(db)[:limit]
        results: list[Memory] = []
        seen: set[int] = set()
        for word in words[:5]:
            for mem in self.search(db, word, limit=limit):
                if mem.id not in seen:
                    seen.add(mem.id)
                    results.append(mem)
        return results[:limit]


memory_service = MemoryService()
