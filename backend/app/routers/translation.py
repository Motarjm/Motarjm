import json
import base64
import asyncio
from typing import Optional, Tuple
import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, Query, Request
from fastapi.responses import StreamingResponse
from io import BytesIO
from app.services.translation_service import translate_file_content_pdf_streaming, translate_file_content_xliff_streaming, is_image_based, translate_file_content_docx_streaming
from app.services.glossary_service import parse_tbx_basic, store_glossary, get_glossary
from app.services.tm_service import parse_tmx, store_tm, get_tm, search_tm, search_tm_char
from app.services.pdf_service import build_translated_pdf_base64
from app.services.xliff_service import build_xliff, build_xliff_from_scratch
from app.core.simple_calls import clear_doc_summary_cache
from app.state.job_store import job_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translation", tags=["Translation"])

#TODO: I should isolate the reading of the file from the translation, cuz tranlsation function is the same
#TODO: the structure of translated contents is different at different stages for pdf and xliff, it should be unified.
# IN pdf, it is a list of list of dicts which is made in extraction
# But in XLIFF and docx it is extracted as a list of dicts, then before sending it to frontend I encapsulate it in a list to make it a list of list of dicts

SSE_HEADERS = {
    "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}

# How long the stream endpoint waits for a new event before sending a keep-alive
# comment and checking again. Keeps the SSE connection alive across proxies.
STREAM_POLL_INTERVAL = 0.5


# ─────────────────────────────────────────────────────────────────────────────
# Background job runners
# Each of these is scheduled with asyncio.create_task(...) and keeps running
# independent of whether any client is listening. The only way to stop one
# early is job_store.request_cancel(job_id), which these check between steps.
# ─────────────────────────────────────────────────────────────────────────────

def _run_pdf_job_sync(job_id: str, pdf_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None):
    logger.info(f"[pdf_job {job_id}] starting: {source_lang}->{target_lang}, {len(pdf_bytes)} bytes")
    # Runs in a worker thread (via asyncio.to_thread) so the blocking calls inside
    # translate_file_content_pdf_streaming never freeze the event loop, and the
    # /stream/{job_id} endpoint can keep polling job_store in real time.
    for event in translate_file_content_pdf_streaming(
        pdf_bytes, source_lang, target_lang, style_guide or "", glossary=glossary_dict,
    ):
        if job_store.is_cancelled(job_id):
            logger.info(f"[pdf_job {job_id}] cancelled")
            return

        if event["type"] == "progress":
            job_store.append_event(job_id, event)
        elif event["type"] == "done":
            translated_contents = event["translated_contents"]
            pdf_base64 = build_translated_pdf_base64(translated_contents, pdf_bytes)
            original_pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            result = {
                "type": "done",
                "translated_contents": translated_contents,
                "pdf": pdf_base64,
                "original_pdf_base64": original_pdf_base64,
                "glossary_id": glossary_id,  # ADD

            }
            job_store.append_event(job_id, result)
            job_store.mark_done(job_id, result)
            logger.info(f"[pdf_job {job_id}] done")


async def run_pdf_job(job_id: str, pdf_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict,glossary_id: Optional[str] = None):
    try:
        await asyncio.to_thread(_run_pdf_job_sync, job_id, pdf_bytes, source_lang, target_lang, style_guide, glossary_dict,glossary_id)
    except Exception as exc:
        logger.exception(f"[pdf_job {job_id}] failed")
        job_store.mark_error(job_id, str(exc))


def _run_xliff_job_sync(job_id: str, xliff_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None):
    logger.info(f"[xliff_job {job_id}] starting: {source_lang}->{target_lang}, {len(xliff_bytes)} bytes")
    for event in translate_file_content_xliff_streaming(
        xliff_bytes, source_lang, target_lang, style_guide or "", glossary=glossary_dict,
    ):
        if job_store.is_cancelled(job_id):
            logger.info(f"[xliff_job {job_id}] cancelled")
            return

        if event["type"] == "progress":
            job_store.append_event(job_id, event)
        elif event["type"] == "done":
            translated_contents = event["translated_contents"]
            xliff_output_str, _ = build_xliff(xliff_bytes, translated_contents)
            if isinstance(xliff_output_str, bytes):
                xliff_output_str = xliff_output_str.decode('utf-8')
            result = {
                "type": "done",
                "translated_contents": [translated_contents],
                "xliff": xliff_output_str,
                "glossary_id": glossary_id,  # ADD

            }
            job_store.append_event(job_id, result)
            job_store.mark_done(job_id, result)
            logger.info(f"[xliff_job {job_id}] done")


async def run_xliff_job(job_id: str, xliff_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None):
    try:
        await asyncio.to_thread(_run_xliff_job_sync, job_id, xliff_bytes, source_lang, target_lang, style_guide, glossary_dict, glossary_id)
    except Exception as exc:
        logger.exception(f"[xliff_job {job_id}] failed")
        job_store.mark_error(job_id, str(exc))


def _run_docx_job_sync(job_id: str, docx_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None):
    logger.info(f"[docx_job {job_id}] starting: {source_lang}->{target_lang}, {len(docx_bytes)} bytes")
    for event in translate_file_content_docx_streaming(
        BytesIO(docx_bytes), source_lang, target_lang, style_guide or "", glossary=glossary_dict,
    ):
        if job_store.is_cancelled(job_id):
            logger.info(f"[docx_job {job_id}] cancelled")
            return

        if event["type"] == "progress":
            job_store.append_event(job_id, event)
        elif event["type"] == "done":
            translated_contents = event["translated_contents"]
            xliff_output_str = build_xliff_from_scratch(translated_contents, source_lang, target_lang)
            if isinstance(xliff_output_str, bytes):
                xliff_output_str = xliff_output_str.decode('utf-8')
            result = {
                "type": "done",
                "translated_contents": [translated_contents],
                "xliff": xliff_output_str,
                "glossary_id": glossary_id,  # ADD
            }
            job_store.append_event(job_id, result)
            job_store.mark_done(job_id, result)
            logger.info(f"[docx_job {job_id}] done")


async def run_docx_job(job_id: str, docx_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None):
    try:
        await asyncio.to_thread(_run_docx_job_sync, job_id, docx_bytes, source_lang, target_lang, style_guide, glossary_dict, glossary_id)
    except Exception as exc:
        logger.exception(f"[docx_job {job_id}] failed")
        job_store.mark_error(job_id, str(exc))


def _parse_glossary(glossary: UploadFile, glossary_bytes: bytes, source_lang: str, target_lang: str) -> Tuple[dict, Optional[str]]:
    if not glossary.filename.endswith(".tbx"):
        logger.warning(f"rejected glossary upload with invalid extension: {glossary.filename}")
        raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
    try:
        glossary_dict = parse_tbx_basic(glossary_bytes, source_lang=source_lang, target_lang=target_lang)
    except ValueError as exc:
        logger.exception(f"failed to parse glossary {glossary.filename}")
        raise HTTPException(status_code=400, detail=str(exc))
    glossary_dict = glossary_dict or {}
    glossary_id = None
    if glossary_dict:
        glossary_id, _expires_at = store_glossary(glossary_dict)
    return glossary_dict, glossary_id


def _parse_tm(tm_file: UploadFile, tm_bytes: bytes, source_lang: str, target_lang: str) -> Optional[str]:
    if not tm_file.filename.lower().endswith(".tmx"):
        raise HTTPException(status_code=400, detail="Only .tmx translation memory files are allowed")
    try:
        entries = parse_tmx(tm_bytes, source_lang=source_lang, target_lang=target_lang)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not entries:
        return None
    return store_tm(entries)


# ─────────────────────────────────────────────────────────────────────────────
# "Start job" endpoints — validate input, kick off background work, return
# immediately with a job_id. These no longer stream anything themselves.
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pdf")
async def translate_pdf_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    style_guide: str = Query(None),
):
    if not file.filename.endswith(".pdf"):
        logger.warning(f"rejected non-pdf upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        logger.warning(f"rejected upload with bad content_type: {file.content_type}")
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")

    try:
        pdf_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded PDF: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read PDF file")

    glossary_dict = {}
    glossary_id = None
    if glossary:
        try:
            tbx_bytes = await glossary.read()
        except Exception:
            logger.exception(f"failed to read TBX glossary: {glossary.filename}")
            raise HTTPException(status_code=400, detail="Failed to read TBX file")
        glossary_dict, glossary_id = _parse_glossary(glossary, tbx_bytes, source_lang, target_lang)

    tm_id = None
    if translation_memory:
        try:
            tmx_bytes = await translation_memory.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to read TMX file")
        tm_id = _parse_tm(translation_memory, tmx_bytes, source_lang, target_lang)

    clear_doc_summary_cache()

    job_id = job_store.create_job()
    logger.info(f"[pdf_job {job_id}] created for {file.filename}")
    asyncio.create_task(run_pdf_job(job_id, pdf_bytes, source_lang, target_lang, style_guide, glossary_dict))
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}


@router.post("/xliff")
async def translate_xliff_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    style_guide: str = Query(None),
):
    if not file.filename.endswith(".xliff") and not file.filename.endswith(".xlf") and not file.filename.endswith(".sdlxliff") and not file.filename.endswith(".mqxliff"):
        logger.warning(f"rejected non-xliff upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .xliff or .xlf files are allowed")

    try:
        xliff_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded XLIFF: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read XLIFF file")

    glossary_dict = {}
    glossary_id = None
    if glossary:
        try:
            tbx_bytes = await glossary.read()
        except Exception:
            logger.exception(f"failed to read TBX glossary: {glossary.filename}")
            raise HTTPException(status_code=400, detail="Failed to read TBX file")
        glossary_dict, glossary_id = _parse_glossary(glossary, tbx_bytes, source_lang, target_lang)

    tm_id = None
    if translation_memory:
        try:
            tmx_bytes = await translation_memory.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to read TMX file")
        tm_id = _parse_tm(translation_memory, tmx_bytes, source_lang, target_lang)

    clear_doc_summary_cache()

    job_id = job_store.create_job()
    logger.info(f"[xliff_job {job_id}] created for {file.filename}")
    asyncio.create_task(run_xliff_job(job_id, xliff_bytes, source_lang, target_lang, style_guide, glossary_dict))
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}


@router.post("/docx")
async def translate_docx_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    style_guide: str = Query(None),
):
    if not file.filename.endswith(".docx"):
        logger.warning(f"rejected non-docx upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .docx files are allowed")

    try:
        docx_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded DOCX: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read DOCX file")

    glossary_dict = {}
    glossary_id = None
    if glossary:
        try:
            tbx_bytes = await glossary.read()
        except Exception:
            logger.exception(f"failed to read TBX glossary: {glossary.filename}")
            raise HTTPException(status_code=400, detail="Failed to read TBX file")
        glossary_dict, glossary_id = _parse_glossary(glossary, tbx_bytes, source_lang, target_lang)

    tm_id = None
    if translation_memory:
        try:
            tmx_bytes = await translation_memory.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to read TMX file")
        tm_id = _parse_tm(translation_memory, tmx_bytes, source_lang, target_lang)

    clear_doc_summary_cache()

    job_id = job_store.create_job()
    logger.info(f"[docx_job {job_id}] created for {file.filename}")
    asyncio.create_task(run_docx_job(job_id, docx_bytes, source_lang, target_lang, style_guide, glossary_dict))
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}


@router.get("/glossary/{glossary_id}")
async def fetch_glossary(glossary_id: str):
    terms = get_glossary(glossary_id)
    if terms is None:
        raise HTTPException(status_code=404, detail="Unknown or expired glossary_id")
    return {"glossary_id": glossary_id, "terms": terms}


@router.get("/tm/search")
async def tm_search(
    tm_id: str = Query(...),
    query: str = Query(...),
    top_k: int = Query(5, ge=1, le=20),
    mode: str = Query("token", regex="^(token|char)$"),
):
    if get_tm(tm_id) is None:
        raise HTTPException(status_code=404, detail="Unknown or expired tm_id")
    if mode == "char":
        matches = search_tm_char(tm_id, query, top_k=top_k)
    else:
        matches = search_tm(tm_id, query, top_k=top_k)
    return {"matches": matches}


@router.get("/tm/{tm_id}")
async def fetch_tm(tm_id: str):
    entries = get_tm(tm_id)
    if entries is None:
        raise HTTPException(status_code=404, detail="Unknown or expired tm_id")
    return {"tm_id": tm_id, "entries": [{"source": s, "target": t} for s, t in entries]}


# ─────────────────────────────────────────────────────────────────────────────
# "Watch job" endpoint — a pure viewer. Disconnecting from this stream (tab
# refresh/close) does NOT touch the background job; reconnecting just replays
# missed events and keeps watching.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/stream/{job_id}")
async def stream_job(request: Request, job_id: str):
    job = job_store.get(job_id)
    if job is None:
        logger.warning(f"[stream] unknown job_id: {job_id}")
        raise HTTPException(status_code=404, detail="Unknown job_id")

    async def event_stream():
        offset = 0
        while True:
            if await request.is_disconnected():
                # Only the viewer stops here — the background task keeps running.
                logger.info(f"[stream {job_id}] viewer disconnected")
                break

            new_events = job_store.events_from(job_id, offset)
            for event in new_events:
                yield f"data: {json.dumps(event)}\n\n"
            offset += len(new_events)

            status = job_store.status(job_id)
            if status in ("done", "error", "cancelled"):
                if status == "error":
                    job = job_store.get(job_id)
                    logger.error(f"[stream {job_id}] job errored: {job.get('error')}")
                    yield f"data: {json.dumps({'type': 'error', 'detail': job.get('error')})}\n\n"
                break

            # Keep-alive comment so proxies/browsers don't time out the connection
            yield ": keep-alive\n\n"
            await asyncio.sleep(STREAM_POLL_INTERVAL)

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=SSE_HEADERS)


# ─────────────────────────────────────────────────────────────────────────────
# Cancel endpoint — the ONLY thing that should actually stop a running job.
# Wire this to the "تغيير الملف ✕" button, not to tab close/refresh.
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/cancel/{job_id}")
async def cancel_job(job_id: str):
    found = job_store.request_cancel(job_id)
    if not found:
        logger.warning(f"[cancel] unknown job_id: {job_id}")
        raise HTTPException(status_code=404, detail="Unknown job_id")
    logger.info(f"[cancel] job {job_id} cancelled by client")
    print("Client Cancelled Job")
    return {"job_id": job_id, "cancelled": True}