import io
import re
from typing import Dict, List, Tuple

try:
    from lxml import etree
except ImportError:
    raise ImportError("lxml is required: pip install lxml")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SDL_NS = "http://sdl.com/FileTypes/SdlXliff/1.0"
_SDL_PREFIX = f"{{{_SDL_NS}}}"

# Segments with these conf values must not be overwritten
_LOCKED_CONFS = {"ApprovedTranslation", "ApprovedSignOff"}

# Parser that preserves every byte of structure: comments, PIs, whitespace, CDATA
_PARSER = etree.XMLParser(
    remove_blank_text=False,
    remove_comments=False,
    remove_pis=False,
    strip_cdata=False,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _xliff_ns_prefix(root) -> str:
    """Return the Clark-notation prefix for the XLIFF namespace, e.g. '{urn:...}'."""
    tag = root.tag
    if tag.startswith("{"):
        return "{" + tag[1 : tag.index("}")] + "}"
    return ""


def _collect_text(element) -> str:
    """
    Recursively collect all text from an element, descending through any
    inline tags (<g>, <ph>, <x>, <mrk>, …).  Tail text of the root element
    itself is intentionally excluded (it belongs to the parent context).
    """
    parts: List[str] = []
    if element.text:
        parts.append(element.text)
    for child in element:
        parts.append(_collect_text(child))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts)


def _is_locked(tu, xliff_prefix: str) -> bool:
    """
    Return True if *any* segment in this trans-unit is locked or already
    carries an approved confirmation status.  Both the SDL attribute and the
    XLIFF-standard translate="no" attribute are checked by the caller, so
    this function only looks at SDL-specific locking.
    """
    for seg in tu.findall(f".//{_SDL_PREFIX}seg"):
        if seg.get("locked") == "true":
            return True
        if seg.get("conf", "") in _LOCKED_CONFS:
            return True
    return False


def _update_sdl_conf(tu, mid: str):
    """Set conf="Translated" on the <sdl:seg> whose id matches *mid*."""
    for seg in tu.findall(f".//{_SDL_PREFIX}seg"):
        if seg.get("id") == mid:
            seg.set("conf", "Translated")
            return


def _find_mrk_segs(element, xliff_prefix: str) -> List:
    """
    Find all <mrk mtype="seg"> elements inside *element*.
    Tries with the XLIFF namespace first, then without (some MQXLIFF variants
    omit the namespace on inline elements).
    """
    found = element.findall(f".//{xliff_prefix}mrk[@mtype='seg']")
    if not found:
        found = element.findall(".//mrk[@mtype='seg']")
    return found


def _restore_preamble(original: bytes, output: bytes) -> bytes:
    """
    lxml always rewrites the XML declaration (single quotes, reordered attrs)
    and may reorder root-element attributes.  This function restores the
    original declaration line and the original root opening tag byte-for-byte
    so the output is structurally identical to the input everywhere we did
    not intentionally change content.
    """
    # 1. Restore XML declaration
    orig_decl = re.match(rb"<\?xml[^?]*\?>", original)
    out_decl = re.match(rb"<\?xml[^?]*\?>", output)
    if orig_decl and out_decl:
        output = orig_decl.group(0) + output[out_decl.end() :]

    # 2. Restore root opening tag (preserves attribute order, namespace prefixes, etc.)
    tag_pattern = rb"<[a-zA-Z][^>]*?(?<!/)>"
    orig_root = re.search(tag_pattern, original, re.DOTALL)
    out_root = re.search(tag_pattern, output, re.DOTALL)
    if orig_root and out_root:
        output = (
            output[: out_root.start()]
            + orig_root.group(0)
            + output[out_root.end() :]
        )

    # 3. Restore trailing newline if the original had one
    if original.endswith(b"\n") and not output.endswith(b"\n"):
        output += b"\n"

    return output


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_text_from_xliff(xliff_bytes: bytes) -> List[Dict[str, str]]:
    """
    Extract translatable source segments from any XLIFF variant
    (vanilla XLIFF 1.2, SDLXLIFF, MQXLIFF).

    Segments are skipped when: -> NO SEGMENTS ARE SKIPPED FOR NOW
    - translate="no" is set on the trans-unit
    - the segment is locked (SDL locked="true")
    - the segment already carries an approved confirmation status

    Returns a list of dicts, each with:
        "id"   — the mrk mid when the file uses split segments, otherwise
                 the trans-unit id
        "text" — plain text of the source segment (inline tag text
                 concatenated, tag elements stripped)
    """
    try:
        root = etree.fromstring(xliff_bytes, parser=_PARSER)
    except etree.XMLSyntaxError as exc:
        raise RuntimeError(f"Failed to parse XLIFF: {exc}") from exc

    xliff_prefix = _xliff_ns_prefix(root)
    segments: List[Dict[str, str]] = []

    for tu in root.findall(f".//{xliff_prefix}trans-unit"):
        # --- Respect translate="no" ---
        # if tu.get("translate") == "no":
        #     continue

        # # --- Respect SDL locking / approval ---
        # if _is_locked(tu, xliff_prefix):
        #     continue

        unit_id = tu.get("id", "")
        source_elem = tu.find(f"{xliff_prefix}source")
        if source_elem is None:
            continue

        # --- Split-segment files: use <seg-source> + <mrk mid=""> ---
        seg_source = tu.find(f"{xliff_prefix}seg-source")
        if seg_source is not None:
            mrk_elems = _find_mrk_segs(seg_source, xliff_prefix)
            if mrk_elems:
                for mrk in mrk_elems:
                    mid = mrk.get("mid", unit_id)
                    text = _collect_text(mrk).strip()
                    if text:
                        segments.append({"id": mid, "text": text})
                continue

        # --- Plain single-segment (vanilla XLIFF) ---
        text = _collect_text(source_elem).strip()
        if text:
            segments.append({"id": unit_id, "text": text})

    return segments


def build_xliff(
    xliff_bytes: bytes,
    translations: List[Dict[str, str]],
) -> Tuple[bytes, List[str]]:
    """
    Inject translated text into the target segments of an existing XLIFF file.

    Rules:
    - Only <target> / <mrk> text is written.  Every other node, attribute,
      comment, processing instruction, whitespace, and inline tag is left
      completely untouched.
      
    - NOT ENFORCED FOR NOW -> translate="no" and SDL-locked/approved segments are never overwritten.
    
    - For SDL files, the matching <sdl:seg conf="..."> is updated to
      "Translated" so Trados recognises the segment.
      
    - If a <target> element is missing entirely (vanilla XLIFF), it is
      created immediately after <source> using lxml's addnext() — the
      safest insertion method when the trans-unit has wrapper children.

    Args:
        xliff_bytes:  Original XLIFF file bytes.
        translations: List of {"id": <mid or trans-unit id>, "text": <translated>}.
                      Keys "id" and "text" are required; missing keys raise ValueError.

    Returns:
        (modified_bytes, unmatched_ids) where unmatched_ids is a list of
        translation IDs that did not correspond to any segment in the file.

    Raises:
        ValueError  — if any translation dict is missing "id" or "text".
        RuntimeError — if the file cannot be parsed.
    """
    # Validate input early with a clear message
    for i, item in enumerate(translations):
        if "id" not in item or "translated_text" not in item:
            raise ValueError(
                f"translations[{i}] is missing required key(s) "
                f"{'id' if 'id' not in item else 'translated_text'!r}. "
                f"Each entry must have both 'id' and 'translated_text'."
            )

    translation_map: Dict[str, str] = {t["id"]: t["translated_text"] for t in translations}
    unmatched: set = set(translation_map.keys())

    try:
        tree = etree.parse(io.BytesIO(xliff_bytes), _PARSER)
    except etree.XMLSyntaxError as exc:
        raise RuntimeError(f"Failed to parse XLIFF: {exc}") from exc

    root = tree.getroot()
    xliff_prefix = _xliff_ns_prefix(root)

    for tu in root.findall(f".//{xliff_prefix}trans-unit"):
        # --- Respect translate="no" ---
        # if tu.get("translate") == "no":
        #     continue

        # # --- Respect SDL locking / approval ---
        # if _is_locked(tu, xliff_prefix):
        #     continue

        unit_id = tu.get("id", "")
        target_elem = tu.find(f"{xliff_prefix}target")

        # --- Case 1: <target> contains <mrk mtype="seg"> (SDLXLIFF / MQXLIFF) ---
        if target_elem is not None:
            mrk_elems = _find_mrk_segs(target_elem, xliff_prefix)
            if mrk_elems:
                for mrk in mrk_elems:
                    mid = mrk.get("mid", "")
                    if mid not in translation_map:
                        continue
                    # Set translated text.  We do NOT clear children — any
                    # existing inline tags stay in place.  Only .text changes.
                    mrk.text = translation_map[mid]
                    _update_sdl_conf(tu, mid)
                    unmatched.discard(mid)
                continue  # done with this trans-unit

        # --- Case 2: plain single-segment (vanilla XLIFF, no mrk) ---
        if unit_id not in translation_map:
            continue

        if target_elem is None:
            source_elem = tu.find(f"{xliff_prefix}source")
            if source_elem is None:
                continue
            target_elem = etree.Element(f"{xliff_prefix}target")
            # addnext() is safe regardless of whether source_elem is a direct
            # child or wrapped — it inserts at the correct sibling position.
            source_elem.addnext(target_elem)

        # Set text only; existing children (inline tags) are not disturbed.
        target_elem.text = translation_map[unit_id]
        _update_sdl_conf(tu, unit_id)
        unmatched.discard(unit_id)

    output = etree.tostring(tree, encoding="utf-8", xml_declaration=True)
    output = _restore_preamble(xliff_bytes, output)

    return output, sorted(unmatched)


def build_xliff_from_scratch(
    translations: List[Dict[str, str]],
    source_lang: str = "en",
    target_lang: str = "ar",
) -> bytes:
    """
    Build a new XLIFF 1.2 file from translated segments when the original
    document was a PDF (not an XLIFF file).
    
    This creates a standard vanilla XLIFF structure with one trans-unit per
    translated segment. Each trans-unit contains a source (original English)
    and target (Arabic translation).
    
    Args:
        translations: List of {"original_text": <source>, "translated_text": <target>}.
                      Keys "original_text" and "translated_text" are required.
        source_lang: Source language code (default: "en")
        target_lang: Target language code (default: "ar")
    
    Returns:
        XLIFF file bytes (UTF-8 encoded XML)
    
    Raises:
        ValueError — if any translation dict is missing required keys.
    """
    # Validate input
    for i, item in enumerate(translations):
        if "original_text" not in item or "translated_text" not in item:
            raise ValueError(
                f"translations[{i}] is missing required key(s). "
                f"Each entry must have both 'original_text' and 'translated_text'."
            )
    
    # Create root XLIFF element
    xliff = etree.Element(
        "xliff",
        version="1.2",
        xmlns="urn:oasis:names:tc:xliff:document:1.2"
    )
    
    # Create file element
    file_elem = etree.SubElement(
        xliff,
        "file",
        original="document.pdf",
        source_language=source_lang,
        target_language=target_lang,
        datatype="plaintext",
    )
    
    # Create body element
    body = etree.SubElement(file_elem, "body")
    
    # Add trans-units for each translated segment
    for idx, item in enumerate(translations):
        trans_unit = etree.SubElement(
            body,
            "trans-unit",
            id=f"seg_{idx + 1}",
        )
        
        # Add source element
        source_elem = etree.SubElement(trans_unit, "source")
        source_elem.text = item["original_text"]
        
        # Add target element
        target_elem = etree.SubElement(trans_unit, "target")
        target_elem.text = item["translated_text"]
    
    # Convert to bytes with XML declaration
    output = etree.tostring(
        xliff,
        encoding="utf-8",
        xml_declaration=True,
        pretty_print=True,
    )
    
    return output