import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Glossary(Base):
    __tablename__ = "glossaries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    source_lang: Mapped[str] = mapped_column(String)
    target_lang: Mapped[str] = mapped_column(String)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entries: Mapped[list["GlossaryEntry"]] = relationship(
        back_populates="glossary", cascade="all, delete-orphan"
    )


class GlossaryEntry(Base):
    __tablename__ = "glossary_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    glossary_id: Mapped[str] = mapped_column(String, ForeignKey("glossaries.id"), index=True)
    source_term: Mapped[str] = mapped_column(String)
    target_term: Mapped[str] = mapped_column(String)

    glossary: Mapped["Glossary"] = relationship(back_populates="entries")
