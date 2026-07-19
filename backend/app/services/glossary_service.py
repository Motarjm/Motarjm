import re
import time
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

TTL_SECONDS = 7 * 24 * 60 * 60
#TODO: MUST BE MIGRATED TO DATABASE
_GLOSSARY_STORE: Dict[str, Dict[str, object]] = {}


def _strip_namespace(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def parse_tbx_basic(
    tbx_bytes: bytes,
    source_lang: Optional[str] = None,
    target_lang: Optional[str] = None,
) -> Dict[str, str]:
    """
    Parse a TBX-Basic file into a simple term -> translation dict.

    If source_lang and target_lang are provided, only entries with both are used.
    Otherwise, entries with exactly two languages are mapped by order of appearance.
    """
    try:
        root = ET.fromstring(tbx_bytes)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid TBX XML: {exc}")

    glossary: Dict[str, str] = {}

    for term_entry in root.iter():
        # Only process termEntry nodes (ignore TBX header/metadata).
        if _strip_namespace(term_entry.tag) != "termEntry":
            continue

        lang_terms: Dict[str, str] = {}
        for lang_set in term_entry:
            # Each langSet represents terms for a single language.
            if _strip_namespace(lang_set.tag) != "langSet":
                continue

            # TBX uses xml:lang namespaced attribute for language code.
            lang = lang_set.attrib.get("{http://www.w3.org/XML/1998/namespace}lang")
            if not lang:
                continue

            term_value = None
            # Take the first term in the first tig we find.
            for tig in lang_set:
                if _strip_namespace(tig.tag) != "tig":
                    continue
                for term_el in tig:
                    if _strip_namespace(term_el.tag) == "term" and term_el.text:
                        term_value = term_el.text.strip()
                        break
                if term_value:
                    break

            if term_value:
                lang_terms[lang] = term_value

        if source_lang and target_lang:
            # Strict mapping when language codes are provided.
            source_term = lang_terms.get(source_lang)
            target_term = lang_terms.get(target_lang)
            if not source_term or not target_term:
                continue
            if source_term not in glossary:
                glossary[source_term] = target_term
            continue

        if len(lang_terms) == 2:
            # Fallback: map in the order languages appear in the TBX entry.
            langs = list(lang_terms.keys())
            source_term = lang_terms[langs[0]]
            target_term = lang_terms[langs[1]]
            if source_term and target_term and source_term not in glossary:
                glossary[source_term] = target_term

    return glossary


def store_glossary(glossary: Dict[str, str]) -> Tuple[str, int]:
    _purge_expired()
    glossary_id = str(uuid4())
    expires_at = int(time.time()) + TTL_SECONDS
    _GLOSSARY_STORE[glossary_id] = {
        "terms": glossary,
        "expires_at": expires_at,
    }
    return glossary_id, expires_at


def get_glossary(glossary_id: str) -> Optional[Dict[str, str]]:
    _purge_expired()
    entry = _GLOSSARY_STORE.get(glossary_id)
    if not entry:
        return None
    return entry.get("terms")


def _purge_expired() -> None:
    now = int(time.time())
    expired_ids = [gid for gid, entry in _GLOSSARY_STORE.items() if entry.get("expires_at", 0) <= now]
    for glossary_id in expired_ids:
        _GLOSSARY_STORE.pop(glossary_id, None)


