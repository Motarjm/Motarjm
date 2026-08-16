from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.document import Document
from app.db.models.segment import Segment


async def create_document(
    db: AsyncSession,
    *,
    file_name: str,
    file_type: str,
    source_lang: str,
    target_lang: str,
    original_file_path: Optional[str] = None,
    job_id: Optional[str] = None,
    glossary_id: Optional[str] = None,
    tm_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Document:
    document = Document(
        file_name=file_name,
        file_type=file_type,
        source_lang=source_lang,
        target_lang=target_lang,
        original_file_path=original_file_path,
        job_id=job_id,
        glossary_id=glossary_id,
        tm_id=tm_id,
        user_id=user_id,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def get_document(db: AsyncSession, document_id: str, *, with_segments: bool = False) -> Optional[Document]:
    if with_segments:
        result = await db.execute(
            select(Document).where(Document.id == document_id).options(selectinload(Document.segments))
        )
        return result.scalar_one_or_none()
    return await db.get(Document, document_id)


async def list_documents(db: AsyncSession, *, user_id: Optional[str] = None) -> list[Document]:
    stmt = select(Document).order_by(Document.created_at.desc())
    if user_id is not None:
        stmt = stmt.where(Document.user_id == user_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def delete_document(db: AsyncSession, document_id: str) -> bool:
    document = await db.get(Document, document_id)
    if document is None:
        return False
    await db.delete(document)  # cascades to segments
    await db.commit()
    return True


async def replace_segments(db: AsyncSession, document_id: str, segments: list[dict[str, Any]]) -> None:
    """Bulk-replace all segments for a document — used right after a
    translation job completes and translated_contents is flattened."""
    await db.execute(Segment.__table__.delete().where(Segment.document_id == document_id))
    for seg in segments:
        db.add(Segment(
            id=seg["id"],
            document_id=document_id,
            page_index=seg.get("page_index", 0),
            index=seg["index"],
            original_text=seg.get("original_text", ""),
            translated_text=seg.get("translated_text", ""),
            bbox=seg.get("bbox"),
            block_type=seg.get("type", "Text"),
            info=seg.get("info", {}),
        ))
    await db.commit()


async def update_segment_translation(db: AsyncSession, segment_id: str, translated_text: str, *, confirmed: bool = False) -> Optional[Segment]:
    segment = await db.get(Segment, segment_id)
    if segment is None:
        return None
    segment.translated_text = translated_text
    segment.confirmed = confirmed
    await db.commit()
    await db.refresh(segment)
    return segment
