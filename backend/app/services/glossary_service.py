import xml.etree.ElementTree as ET
from typing import Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories import glossary_repo


def _get_local_name(tag: str) -> str:
    """Strip namespace URI from an XML tag, returning the local name."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _get_xml_lang(element: ET.Element) -> Optional[str]:
    """Extract xml:lang from an element, handling namespaced and plain forms."""
    # Standard namespaced xml:lang used by TBX
    lang = element.attrib.get("{http://www.w3.org/XML/1998/namespace}lang")
    if lang:
        return lang
    # Fallback for non-standard files
    lang = element.attrib.get("lang")
    if lang:
        return lang
    # Defensive scan
    for key in element.attrib:
        if key.endswith("}lang") or key == "lang":
            return element.attrib[key]
    return None


def _extract_text(element: ET.Element) -> str:
    """Extract all text from an element, including nested children."""
    return "".join(element.itertext()).strip()


def _lang_matches(tbx_lang: str, requested_lang: str) -> bool:
    """Check if a TBX language code matches a requested code.
    
    Supports prefix matching so 'en' matches 'en-US', 'en-GB', etc.
    """
    tbx_norm = tbx_lang.lower().replace("_", "-")
    req_norm = requested_lang.lower().replace("_", "-")
    if tbx_norm == req_norm:
        return True
    if tbx_norm.startswith(req_norm + "-"):
        return True
    return False


def _find_terms_in_lang_sec(lang_sec: ET.Element) -> List[str]:
    """Extract term texts from a language section.
    
    Handles TBX structural variants:
      - tig -> term          (TBX v1/v2)
      - termSec -> term      (TBX v3)
      - ntig -> termGrp -> term   (TBX v1/v2 normalized)
    """
    terms: List[str] = []

    for child in lang_sec:
        child_name = _get_local_name(child.tag)

        if child_name in ("tig", "termSec"):
            for sub in child:
                if _get_local_name(sub.tag) == "term":
                    text = _extract_text(sub)
                    if text:
                        terms.append(text)
                    break  # first term per group

        elif child_name == "ntig":
            for sub in child:
                if _get_local_name(sub.tag) == "termGrp":
                    for term_el in sub:
                        if _get_local_name(term_el.tag) == "term":
                            text = _extract_text(term_el)
                            if text:
                                terms.append(text)
                            break
                    break  # first termGrp per ntig

    return terms


def parse_tbx_basic(
    tbx_bytes: bytes,
    source_lang: Optional[str] = None,
    target_lang: Optional[str] = None,
) -> Dict[str, str]:
    """
    Parse a TBX file (any version/dialect) into a simple term -> translation dict.

    Supports:
      - TBX v1  (martif, termEntry, langSet, tig / ntig)
      - TBX v2 Basic  (martif type="TBX-Basic", same elements)
      - TBX v3  (tbx, conceptEntry, langSec, termSec)
      - Namespaced and non-namespaced variants
      - Mixed content inside <term> elements

    If source_lang and target_lang are provided, only entries containing both
    languages are used. Language matching supports prefix matching
    (e.g. 'en' matches 'en-US').

    If no languages are provided, entries with exactly two languages are mapped
    by order of appearance (first -> second).
    """
    try:
        root = ET.fromstring(tbx_bytes)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid TBX XML: {exc}")

    glossary: Dict[str, str] = {}

    for element in root.iter():
        if _get_local_name(element.tag) not in ("termEntry", "conceptEntry"):
            continue

        # Collect terms by language for this concept
        lang_terms: Dict[str, List[str]] = {}

        for child in element:
            if _get_local_name(child.tag) not in ("langSet", "langSec"):
                continue

            lang = _get_xml_lang(child)
            if not lang:
                continue

            terms = _find_terms_in_lang_sec(child)
            if terms:
                lang_terms.setdefault(lang, []).extend(terms)

        if not lang_terms:
            continue

        if source_lang and target_lang:
            src_terms: Optional[List[str]] = None
            tgt_terms: Optional[List[str]] = None

            for lang, terms in lang_terms.items():
                if _lang_matches(lang, source_lang):
                    src_terms = terms
                if _lang_matches(lang, target_lang):
                    tgt_terms = terms

            if src_terms and tgt_terms:
                src = src_terms[0]
                tgt = tgt_terms[0]
                if src and tgt and src not in glossary:
                    glossary[src] = tgt
            continue

        # Fallback: exactly two languages, map first -> second by appearance order
        if len(lang_terms) == 2:
            langs = list(lang_terms.keys())
            src = lang_terms[langs[0]][0]
            tgt = lang_terms[langs[1]][0]
            if src and tgt and src not in glossary:
                glossary[src] = tgt
    
    return glossary



async def store_glossary(db: AsyncSession, 
                         glossary: Dict[str, str],
                         source_lang: str,
                         target_lang: str,
                         file_name: Optional[str] = None,
                         user_id: Optional[str] = None
                         ) -> str:
    """Persist glossary to Postgres. Returns glossary_id."""
    glossary_obj = await glossary_repo.create_glossary(
        db,
        terms=glossary,
        source_lang=source_lang,
        target_lang=target_lang,
        file_name=file_name,
        user_id=user_id,
    )
    return str(glossary_obj.id)


async def get_glossary(db: AsyncSession, glossary_id: str) -> Optional[Dict[str, str]]:
    """Fetch glossary terms from Postgres."""
    return await glossary_repo.get_glossary_terms(db, glossary_id)

async def _parse_glossary(db: AsyncSession, 
                          file_name: Optional[str],
                          glossary_bytes: bytes, 
                          source_lang: str, 
                          target_lang: str) -> Tuple[dict, Optional[str]]:
    """Parse a TBX glossary file and store it in Postgres, returning the term dict and glossary_id."""
    
    glossary_dict = parse_tbx_basic(glossary_bytes, source_lang=source_lang, target_lang=target_lang)
    
    glossary_dict = glossary_dict or {}
    glossary_id = None
    if glossary_dict:
        glossary_id =  await store_glossary(db, glossary_dict,
                                     source_lang=source_lang,
                                     target_lang=target_lang,
                                     file_name = file_name)
    return glossary_dict, glossary_id


async def _resolve_glossary(
    db: AsyncSession,
    file_name: Optional[str],
    file_bytes: Optional[bytes],
    existing_id: Optional[str],
    source_lang: str,
    target_lang: str,
) -> Tuple[dict, Optional[str]]:
    """Use an uploaded TBX file if provided, otherwise look up by an existing glossary_id."""
    if file_bytes:
        return await _parse_glossary(db, file_name, file_bytes, source_lang, target_lang)
    if existing_id:
        terms = await get_glossary(db, existing_id)
        if terms is None:
            raise ValueError(f"Unknown or expired glossary_id: {existing_id}")
        return terms, existing_id
    return {}, None

