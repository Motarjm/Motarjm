import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TranslationMemory(Base):
    __tablename__ = "translation_memories"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    source_lang: Mapped[str] = mapped_column(String)
    target_lang: Mapped[str] = mapped_column(String)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entries: Mapped[list["TmEntry"]] = relationship(
        back_populates="tm", cascade="all, delete-orphan"
    )


class TmEntry(Base):
    """One source/target pair. Fuzzy (TF-IDF) matching stays in tm_service —
    this table just persists the raw pairs so the index can be rebuilt from
    them on demand instead of living only in memory."""

    __tablename__ = "tm_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tm_id: Mapped[str] = mapped_column(String, ForeignKey("translation_memories.id"), index=True)
    source_text: Mapped[str] = mapped_column(String)
    target_text: Mapped[str] = mapped_column(String)

    tm: Mapped["TranslationMemory"] = relationship(back_populates="entries")
