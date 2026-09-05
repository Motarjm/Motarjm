import io
import time
import uuid
from openpyxl import Workbook
import csv
import io
import time
import uuid
from xml.sax.saxutils import escape

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

def build_terminology_csv(terms: dict) -> bytes:
    """
    Builds a two-column (Source,Target) CSV from the parsed
    terminology_agent output and returns the raw file bytes.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Source", "Target"])
    for source, target in terms.items():
        writer.writerow([source, target])

    # Encode as utf-8-sig so Excel/Word correctly detect UTF-8 (important for Arabic).
    return buffer.getvalue().encode("utf-8-sig")


def build_terminology_tbx(terms: dict, source_lang: str = "", target_lang: str = "") -> bytes:
    """
    Builds a minimal TBX-Basic (Term Base eXchange) document from the parsed
    terminology_agent output and returns the raw file bytes.
    """
    src_lang = source_lang or "src"
    tgt_lang = target_lang or "tgt"

    entries = []
    for i, (source, target) in enumerate(terms.items(), start=1):
        entries.append(f"""    <termEntry id="tE{i}">
      <langSet xml:lang="{escape(src_lang)}">
        <tig>
          <term>{escape(str(source))}</term>
        </tig>
      </langSet>
      <langSet xml:lang="{escape(tgt_lang)}">
        <tig>
          <term>{escape(str(target))}</term>
        </tig>
      </langSet>
    </termEntry>""")

    body = "\n".join(entries)
    tbx = f"""<?xml version="1.0" encoding="UTF-8"?>
<tbx type="TBX-Basic" xml:lang="en">
  <text>
    <body>
{body}
    </body>
  </text>
</tbx>"""

    return tbx.encode("utf-8")