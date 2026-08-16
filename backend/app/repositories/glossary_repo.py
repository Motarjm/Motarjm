from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.glossary import Glossary, GlossaryEntry


async def create_glossary(
    db: AsyncSession,
    *,
    terms: dict[str, str],
    source_lang: str,
    target_lang: str,
    file_name: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Glossary:
    glossary = Glossary(file_name=file_name, source_lang=source_lang, target_lang=target_lang, user_id=user_id)
    glossary.entries = [
        GlossaryEntry(source_term=src, target_term=tgt) for src, tgt in terms.items()
    ]
    db.add(glossary)
    await db.commit()
    await db.refresh(glossary)
    return glossary


async def get_glossary_terms(db: AsyncSession, glossary_id: str) -> Optional[dict[str, str]]:
    """Returns the exact `Optional[Dict[str, str]]` shape translate_text
    already expects as its `glossary=` argument — swap-in for the current
    get_glossary(glossary_id) in-memory lookup."""
    result = await db.execute(
        select(Glossary).where(Glossary.id == glossary_id).options(selectinload(Glossary.entries))
    )
    glossary = result.scalar_one_or_none()
    if glossary is None:
        return None
    return {entry.source_term: entry.target_term for entry in glossary.entries}
