"""
Translation Memory service: TMX parsing, in-memory storage, and fuzzy search.
Mirrors glossary_service's storage pattern but keyed by tm_id.
"""
import uuid
import time
from typing import Optional, List, Dict
from lxml import etree
from rapidfuzz import process, fuzz

# ── In-memory store ──
# tm_id -> {"entries": [(source, target), ...], "created_at": ts}
_tm_store: Dict[str, dict] = {}

TM_TTL_SECONDS = 24 * 60 * 60  # 24h, same spirit as glossary store


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

    def lang_matches(tuv_lang: str, target: str) -> bool:
        if not tuv_lang:
            return False
        tuv_lang = tuv_lang.lower()
        return tuv_lang == target or tuv_lang.startswith(target + "-") or target.startswith(tuv_lang + "-")

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
            if lang_matches(lang, src_lang) and source_seg is None:
                source_seg = text
            elif lang_matches(lang, tgt_lang) and target_seg is None:
                target_seg = text

        if source_seg and target_seg:
            entries.append((source_seg, target_seg))

    return entries


def store_tm(entries: List[tuple]) -> str:
    """Store parsed TM entries in memory, return a tm_id."""
    tm_id = str(uuid.uuid4())
    _tm_store[tm_id] = {"entries": entries, "created_at": time.time()}
    return tm_id


def get_tm(tm_id: str) -> Optional[List[tuple]]:
    entry = _tm_store.get(tm_id)
    if entry is None:
        return None
    if time.time() - entry["created_at"] > TM_TTL_SECONDS:
        _tm_store.pop(tm_id, None)
        return None
    return entry["entries"]


def search_tm(tm_id: str, query: str, top_k: int = 5, min_score: float = 60.0) -> List[dict]:
    """
    Return top_k matches for `query` against the stored TM's source segments,
    scored with RapidFuzz token_sort_ratio (0-100), filtered by min_score.
    Good for segment-level matching where word order / minor rephrasing shouldn't
    tank the score.
    """
    entries = get_tm(tm_id)
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


def search_tm_char(tm_id: str, query: str, top_k: int = 5, min_score: float = 60.0) -> List[dict]:
    """
    Return top_k matches scored purely on character-level edit distance
    (RapidFuzz fuzz.ratio, which is a normalized Levenshtein similarity).
    Unlike search_tm, this does NOT tokenize/reorder words first — it compares
    raw character sequences, so typos/partial strings score by literal
    character overlap rather than word-level similarity. Used for manual
    free-text search.
    """
    entries = get_tm(tm_id)
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