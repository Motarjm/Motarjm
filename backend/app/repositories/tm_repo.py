from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.translation_memory import TmEntry, TranslationMemory


async def create_tm(
    db: AsyncSession,
    *,
    entries: list[tuple[str, str]],  # (source_text, target_text) pairs, matches parse_tmx's current output shape
    source_lang: str,
    target_lang: str,
    file_name: Optional[str] = None,
    user_id: Optional[str] = None,
) -> TranslationMemory:
    tm = TranslationMemory(file_name=file_name, source_lang=source_lang, target_lang=target_lang, user_id=user_id)
    tm.entries = [TmEntry(source_text=src, target_text=tgt) for src, tgt in entries]
    db.add(tm)
    await db.commit()
    await db.refresh(tm)
    return tm


async def get_tm_entries(db: AsyncSession, tm_id: str) -> Optional[list[tuple[str, str]]]:
    """Returns the (source, target) tuple-pair list shape get_tm(tm_id)
    currently returns from memory, so search_tm/search_tm_char's TF-IDF
    index-building code doesn't need to change — only where it sources
    entries from."""
    result = await db.execute(
        select(TranslationMemory).where(TranslationMemory.id == tm_id).options(selectinload(TranslationMemory.entries))
    )
    tm = result.scalar_one_or_none()
    if tm is None:
        return None
    return [(e.source_text, e.target_text) for e in tm.entries]
