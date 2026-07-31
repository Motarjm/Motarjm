import io
import time
import uuid
from openpyxl import Workbook

# ─────────────────────────────────────────────────────────────────────────
# In-memory store for generated files (e.g. the terminology .xlsx).
# A tool can't return binary data to the model, so it stashes the file here
# and returns a short file_id; the frontend then downloads it via
# GET /document/terms-download/{file_id}, which reads from this store.
# Swap this for Redis/disk if you run multiple workers or want persistence.
# ─────────────────────────────────────────────────────────────────────────
_FILE_STORE: dict[str, dict] = {}
_FILE_TTL_SECONDS = 15 * 60


def _cleanup_expired_files() -> None:
    now = time.time()
    expired = [fid for fid, entry in _FILE_STORE.items() if now - entry["created_at"] > _FILE_TTL_SECONDS]
    for fid in expired:
        _FILE_STORE.pop(fid, None)


def store_file(filename: str, content: bytes, media_type: str) -> str:
    """Stores generated file bytes in memory and returns a short-lived file_id."""
    _cleanup_expired_files()
    file_id = uuid.uuid4().hex
    _FILE_STORE[file_id] = {
        "filename": filename,
        "content": content,
        "media_type": media_type,
        "created_at": time.time(),
    }
    return file_id


def get_stored_file(file_id: str) -> dict | None:
    """Retrieves a stored file's bytes/metadata, or None if missing/expired."""
    _cleanup_expired_files()
    return _FILE_STORE.get(file_id)


def build_terminology_xlsx(terms: dict) -> bytes:
    """
    Builds a two-column (Source / Target) .xlsx workbook from the parsed
    terminology_agent output and returns the raw file bytes.
    """

    wb = Workbook()
    ws = wb.active
    ws.title = "Terminology"
    ws.append(["Source", "Target"])
    # terms is a dict {term1: translation1, term2: translation2, ...}
    for source in terms:
        target =  terms[source]
        ws.append([source, target])
    
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()

