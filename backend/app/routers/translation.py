import json
import base64
import asyncio
from fastapi import APIRouter, File, HTTPException, UploadFile, Query, Request
from fastapi.responses import StreamingResponse
from io import BytesIO
from app.services.translation_service import translate_file_content_pdf_streaming, translate_file_content_xliff_streaming, is_image_based, translate_file_content_docx_streaming
from app.services.glossary_service import parse_tbx_basic, store_glossary
from app.services.pdf_service import build_translated_pdf_base64
from app.services.xliff_service import build_xliff, build_xliff_from_scratch
from app.schemas.translation import GenerateEditedPDFRequest
from app.core.simple_calls import clear_doc_summary_cache
from app.state.job_store import job_store

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

def _run_pdf_job_sync(job_id: str, pdf_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict):
    # Runs in a worker thread (via asyncio.to_thread) so the blocking calls inside
    # translate_file_content_pdf_streaming never freeze the event loop, and the
    # /stream/{job_id} endpoint can keep polling job_store in real time.
    for event in translate_file_content_pdf_streaming(
        pdf_bytes, source_lang, target_lang, style_guide or "", glossary=glossary_dict,
    ):
        if job_store.is_cancelled(job_id):
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
            }
            job_store.append_event(job_id, result)
            job_store.mark_done(job_id, result)


async def run_pdf_job(job_id: str, pdf_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict):
    try:
        await asyncio.to_thread(_run_pdf_job_sync, job_id, pdf_bytes, source_lang, target_lang, style_guide, glossary_dict)
    except Exception as exc:
        job_store.mark_error(job_id, str(exc))


def _run_xliff_job_sync(job_id: str, xliff_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict):
    for event in translate_file_content_xliff_streaming(
        xliff_bytes, source_lang, target_lang, style_guide or "", glossary=glossary_dict,
    ):
        if job_store.is_cancelled(job_id):
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
            }
            job_store.append_event(job_id, result)
            job_store.mark_done(job_id, result)


async def run_xliff_job(job_id: str, xliff_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict):
    try:
        await asyncio.to_thread(_run_xliff_job_sync, job_id, xliff_bytes, source_lang, target_lang, style_guide, glossary_dict)
    except Exception as exc:
        job_store.mark_error(job_id, str(exc))


def _run_docx_job_sync(job_id: str, docx_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict):
    for event in translate_file_content_docx_streaming(
        BytesIO(docx_bytes), source_lang, target_lang, style_guide or "", glossary=glossary_dict,
    ):
        if job_store.is_cancelled(job_id):
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
            }
            job_store.append_event(job_id, result)
            job_store.mark_done(job_id, result)


async def run_docx_job(job_id: str, docx_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict):
    try:
        await asyncio.to_thread(_run_docx_job_sync, job_id, docx_bytes, source_lang, target_lang, style_guide, glossary_dict)
    except Exception as exc:
        job_store.mark_error(job_id, str(exc))


def _parse_glossary(glossary: UploadFile, glossary_bytes: bytes, source_lang: str, target_lang: str) -> dict:
    if not glossary.filename.endswith(".tbx"):
        raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
    try:
        glossary_dict = parse_tbx_basic(glossary_bytes, source_lang=source_lang, target_lang=target_lang)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    glossary_dict = glossary_dict or {}
    store_glossary(glossary_dict)
    return glossary_dict


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
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")

    try:
        pdf_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read PDF file")

    glossary_dict = {}
    if glossary:
        try:
            tbx_bytes = await glossary.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to read TBX file")
        glossary_dict = _parse_glossary(glossary, tbx_bytes, source_lang, target_lang)

    clear_doc_summary_cache()

    job_id = job_store.create_job()
    asyncio.create_task(run_pdf_job(job_id, pdf_bytes, source_lang, target_lang, style_guide, glossary_dict))
    return {"job_id": job_id}


@router.post("/xliff")
async def translate_xliff_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    style_guide: str = Query(None),
):
    if not file.filename.endswith(".xliff") and not file.filename.endswith(".xlf") and not file.filename.endswith(".sdlxliff") and not file.filename.endswith(".mqxliff"):
        raise HTTPException(status_code=400, detail="Only .xliff or .xlf files are allowed")

    try:
        xliff_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read XLIFF file")

    glossary_dict = {}
    if glossary:
        try:
            tbx_bytes = await glossary.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to read TBX file")
        glossary_dict = _parse_glossary(glossary, tbx_bytes, source_lang, target_lang)

    clear_doc_summary_cache()

    job_id = job_store.create_job()
    asyncio.create_task(run_xliff_job(job_id, xliff_bytes, source_lang, target_lang, style_guide, glossary_dict))
    return {"job_id": job_id}


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
        raise HTTPException(status_code=400, detail="Only .docx files are allowed")

    try:
        docx_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read DOCX file")

    glossary_dict = {}
    if glossary:
        try:
            tbx_bytes = await glossary.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to read TBX file")
        glossary_dict = _parse_glossary(glossary, tbx_bytes, source_lang, target_lang)

    clear_doc_summary_cache()

    job_id = job_store.create_job()
    asyncio.create_task(run_docx_job(job_id, docx_bytes, source_lang, target_lang, style_guide, glossary_dict))
    return {"job_id": job_id}


# ─────────────────────────────────────────────────────────────────────────────
# "Watch job" endpoint — a pure viewer. Disconnecting from this stream (tab
# refresh/close) does NOT touch the background job; reconnecting just replays
# missed events and keeps watching.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/stream/{job_id}")
async def stream_job(request: Request, job_id: str):
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")

    async def event_stream():
        offset = 0
        while True:
            if await request.is_disconnected():
                # Only the viewer stops here — the background task keeps running.
                break

            new_events = job_store.events_from(job_id, offset)
            for event in new_events:
                yield f"data: {json.dumps(event)}\n\n"
            offset += len(new_events)

            status = job_store.status(job_id)
            if status in ("done", "error", "cancelled"):
                if status == "error":
                    job = job_store.get(job_id)
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
        raise HTTPException(status_code=404, detail="Unknown job_id")
    print("CLIENT CANCELLED")
    return {"job_id": job_id, "cancelled": True}