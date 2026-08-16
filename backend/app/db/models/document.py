import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):
    """A finished/in-progress translation project. Points at files on disk
    (original upload, generated output) rather than storing bytes in Postgres."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_name: Mapped[str] = mapped_column(String)
    file_type: Mapped[str] = mapped_column(String)  # pdf | docx | xliff
    source_lang: Mapped[str] = mapped_column(String)
    target_lang: Mapped[str] = mapped_column(String)

    original_file_path: Mapped[str | None] = mapped_column(String, nullable=True)
    output_file_path: Mapped[str | None] = mapped_column(String, nullable=True)

    job_id: Mapped[str | None] = mapped_column(String, ForeignKey("translation_jobs.id"), nullable=True)
    glossary_id: Mapped[str | None] = mapped_column(String, ForeignKey("glossaries.id"), nullable=True)
    tm_id: Mapped[str | None] = mapped_column(String, ForeignKey("translation_memories.id"), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    segments: Mapped[list["Segment"]] = relationship(
        back_populates="document", order_by="Segment.index", cascade="all, delete-orphan"
    )
