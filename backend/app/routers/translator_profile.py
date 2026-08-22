import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from app.core.simple_calls import extract_translator_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translator-profile", tags=["Translator Profile"])

ALLOWED_EXTENSIONS = (".md", ".txt")

# .md/.txt skill files are frequently authored or re-saved on Windows with
# a non-UTF-8 default encoding — Windows-1256 (cp1256) is the common legacy
# encoding for Arabic text on Windows, and Notepad still defaults some
# locales to UTF-16. Try UTF-8 first (with/without BOM), then fall back
# through these before giving up, rather than 400-ing on the first file
# that isn't strict UTF-8.
_ENCODING_FALLBACKS = ("utf-8-sig", "utf-16", "cp1256", "windows-1252")


def _decode_text(raw_bytes: bytes) -> Optional[str]:
    for encoding in _ENCODING_FALLBACKS:
        try:
            return raw_bytes.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return None


@router.post("")
async def extract_profile(
    skill_file: UploadFile = File(...),
):
    """
    Extracts a translator profile (role + preferences) from an uploaded
    SKILL.md/.txt file. Unlike /glossary, this does NOT persist anything —
    the extracted role/preferences are small, cheap to re-derive, and the
    frontend already holds them in local state and resends them by value
    on every translate/chat request (same as style_guide), so there's no
    need for a profile_id + DB round trip here.
    """
    if not skill_file.filename.lower().endswith(ALLOWED_EXTENSIONS):
        logger.warning(f"rejected translator-profile upload with invalid extension: {skill_file.filename}")
        raise HTTPException(status_code=400, detail="Only .md or .txt files are allowed")

    try:
        raw_bytes = await skill_file.read()
    except Exception:
        logger.exception(f"failed to read translator-profile file: {skill_file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read file")

    text = _decode_text(raw_bytes)
    if text is None:
        logger.warning(f"could not decode translator-profile file with any known encoding: {skill_file.filename}")
        raise HTTPException(
            status_code=400,
            detail="Could not read this file's text encoding. Please save it as UTF-8 and try again.",
        )

    if not text.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        extracted = await asyncio.to_thread(extract_translator_profile, text)
    except Exception:
        logger.exception(f"translator-profile extraction failed for {skill_file.filename}")
        raise HTTPException(status_code=502, detail="Profile extraction failed")

    role = extracted.get("role") if isinstance(extracted, dict) else None
    preferences = extracted.get("preferences") if isinstance(extracted, dict) else None

    if not role and not preferences:
        logger.warning(f"translator-profile extraction returned nothing usable for {skill_file.filename}")
        raise HTTPException(status_code=422, detail="Could not extract a role or preferences from this file")

    return {
        "role": role or "",
        "preferences": preferences if isinstance(preferences, list) else [],
    }