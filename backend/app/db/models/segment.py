from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Segment(Base):
    """One translatable block/segment within a Document. `id` matches the
    frontend's segment id shape (e.g. "0-50" = page 0, block 50) so
    /segment/explanation and friends can address it directly."""

    __tablename__ = "segments"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. "0-50"
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id"), index=True)

    page_index: Mapped[int] = mapped_column(Integer, default=0)  # 0 for docx/xliff (no pages)
    index: Mapped[int] = mapped_column(Integer)  # order within the page/document

    original_text: Mapped[str] = mapped_column(String)
    translated_text: Mapped[str] = mapped_column(String, default="")

    bbox: Mapped[list | None] = mapped_column(JSON, nullable=True)  # PDF only
    block_type: Mapped[str] = mapped_column(String, default="Text")
    info: Mapped[dict] = mapped_column(JSON, default=dict)

    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)  # "Translated" confirm button state

    document: Mapped["Document"] = relationship(back_populates="segments")
