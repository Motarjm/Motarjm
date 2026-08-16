"""
Translation Memory service: TMX parsing, in-memory storage, and fuzzy search.
Mirrors glossary_service's storage pattern but keyed by tm_id.
"""
from typing import Optional, List, Dict
from lxml import etree
from rapidfuzz import process, fuzz
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.glossary_service import _lang_matches
from app.repositories import tm_repo


def parse_tmx(tmx_bytes: bytes, source_lang: str, target_lang: str) -> List[tuple]:
    """
    Parse a .tmx file and return a list of (source_segment, target_segment) tuples
    matching the given language pair. Language codes are matched loosely
    (case-insensitive, prefix match e.g. 'en' matches 'en-US').
    """
    try:
        root = etree.fromstring(tmx_bytes)
    except etree.XMLSyntaxError as exc:
        raise ValueError(f"Invalid TMX file: {exc}")

    src_lang = source_lang.lower()
    tgt_lang = target_lang.lower()

    entries = []
    for tu in root.iter("tu"):
        source_seg, target_seg = None, None
        for tuv in tu.iter("tuv"):
            lang = tuv.get("{http://www.w3.org/XML/1998/namespace}lang") or tuv.get("lang")
            seg_el = tuv.find("seg")
            if seg_el is None:
                continue
            text = "".join(seg_el.itertext()).strip()
            if not text:
                continue
            if _lang_matches(lang, src_lang) and source_seg is None:
                source_seg = text
            elif _lang_matches(lang, tgt_lang) and target_seg is None:
                target_seg = text

        if source_seg and target_seg:
            entries.append((source_seg, target_seg))

    return entries


async def store_tm(
    db: AsyncSession,
    entries: List[tuple],
    source_lang: str,
    target_lang: str,
    file_name: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    tm_obj = await tm_repo.create_tm(
        db,
        entries=entries,
        source_lang=source_lang,
        target_lang=target_lang,
        file_name=file_name,
        user_id=user_id,
    )
    return str(tm_obj.id)


async def get_tm(db: AsyncSession, tm_id: str) -> Optional[List[tuple]]:
    return await tm_repo.get_tm_entries(db, tm_id)


async def search_tm(
    db: AsyncSession,
    tm_id: str,
    query: str,
    top_k: int = 5,
    min_score: float = 60.0,
) -> List[dict]:
    entries = await get_tm(db, tm_id)
    if not entries or not query or not query.strip():
        return []

    sources = [s for s, _ in entries]
    results = process.extract(
        query, sources, scorer=fuzz.token_sort_ratio, limit=top_k
    )
    # results: List[(matched_string, score, index)]
    matches = []
    for matched_source, score, idx in results:
        if score < min_score:
            continue
        matches.append({
            "source": matched_source,
            "target": entries[idx][1],
            "score": score,
        })
    return matches


async def search_tm_char(
    db: AsyncSession,
    tm_id: str,
    query: str,
    top_k: int = 5,
    min_score: float = 60.0,
) -> List[dict]:
    entries = await get_tm(db, tm_id)
    if not entries or not query or not query.strip():
        return []

    sources = [s for s, _ in entries]
    results = process.extract(
        query, sources, scorer=fuzz.ratio, limit=top_k
    )
    matches = []
    for matched_source, score, idx in results:
        if score < min_score:
            continue
        matches.append({
            "source": matched_source,
            "target": entries[idx][1],
            "score": score,
        })
    return matches


async def _parse_tm(db: AsyncSession, file_name: Optional[str], tm_bytes: bytes, source_lang: str, target_lang: str) -> Optional[str]:
    """Parse a TMX file and store it in Postgres, returning the term dict and tm_id."""

    entries = parse_tmx(tm_bytes, source_lang=source_lang, target_lang=target_lang)
    if not entries:
        return None
    
    return await store_tm(db, entries, source_lang, target_lang, file_name=file_name)



async def _resolve_tm(
    db: AsyncSession,
    file_name: Optional[str],
    file_bytes: Optional[bytes],
    existing_id: Optional[str],
    source_lang: str,
    target_lang: str,
) -> Optional[str]:
    """Use an uploaded TMX file if provided, otherwise look up by an existing tm_id."""
    if file_bytes:
        return await _parse_tm(db, file_name, file_bytes, source_lang, target_lang)
    
    if existing_id:
        entries = await get_tm(db, existing_id)
        if entries is None:
            raise ValueError(f"Unknown or expired tm_id: {existing_id}")
        return existing_id
    return None

