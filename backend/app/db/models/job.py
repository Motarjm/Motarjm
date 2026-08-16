import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TranslationJob(Base):
    __tablename__ = "translation_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String, default="running")  # running | done | error | cancelled
    file_type: Mapped[str] = mapped_column(String)  # pdf | docx | xliff | pdf-as-docx
    file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    source_lang: Mapped[str] = mapped_column(String)
    target_lang: Mapped[str] = mapped_column(String)
    glossary_id: Mapped[str | None] = mapped_column(String, ForeignKey("glossaries.id"), nullable=True)
    tm_id: Mapped[str | None] = mapped_column(String, ForeignKey("translation_memories.id"), nullable=True)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # final "done" payload
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    # nullable so jobs stay durable even before auth is wired up; becomes
    # required once every job is created behind get_current_user
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    events: Mapped[list["JobEvent"]] = relationship(
        back_populates="job", order_by="JobEvent.seq", cascade="all, delete-orphan"
    )


class JobEvent(Base):
    """Append-only event log per job. `events_from(job_id, offset)` becomes a
    stateless `WHERE seq > offset` query — replay-safe across SSE reconnects
    and server restarts, unlike a consuming queue."""

    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("translation_jobs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)  # 1-indexed, per-job sequence number
    type: Mapped[str] = mapped_column(String)  # progress | done | error
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["TranslationJob"] = relationship(back_populates="events")
