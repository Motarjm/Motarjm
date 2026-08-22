import base64
import asyncio
from typing import Annotated, List, Optional, Tuple
import logging
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query, Request, Depends
from fastapi.responses import StreamingResponse
from io import BytesIO
from app.services.translation_service import translate_file_content_pdf_streaming, translate_file_content_xliff_streaming, is_image_based, translate_file_content_docx_streaming
from app.services.glossary_service import _resolve_glossary
from app.services.tm_service import  _resolve_tm
from app.services.xliff_service import build_xliff, build_xliff_from_scratch
from app.core.simple_calls import clear_doc_summary_cache
from app.db.session import AsyncSessionLocal, get_db
from app.repositories import job_repo 
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.pdf_service import _convert_pdf_to_docx_bytes
from app.schemas.translation import TranslationRequest


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translation", tags=["Translation"])

#TODO: I should isolate the reading of the file from the translation, cuz tranlsation function is the same
#TODO: the structure of translated contents is different at different stages for pdf and xliff, it should be unified.
# IN pdf, it is a list of list of dicts which is made in extraction
# But in XLIFF and docx it is extracted as a list of dicts, then before sending it to frontend I encapsulate it in a list to make it a list of list of dicts


# ─────────────────────────────────────────────────────────────────────────────
# Background job runners
# Each of these is scheduled with asyncio.create_task(...) and keeps running
# independent of whether any client is listening. The only way to stop one
# early is job_repo.request_cancel(db, job_id), which these check between steps.
#
# Each runner opens its OWN AsyncSessionLocal() rather than reusing the
# request's session — asyncio.create_task means this coroutine outlives the
# HTTP request that started it, and the request-scoped session (from
# Depends(get_db)) is closed as soon as that request returns its response.
#
# translate_file_content_*_streaming are async generators (LLM calls use
# .ainvoke()), so this all runs natively on the event loop — no thread, no
# cross-thread session hand-off needed.
# ─────────────────────────────────────────────────────────────────────────────

async def run_pdf_job(job_id: str, pdf_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None, no_translation: bool = False, user_role: str = "", user_preferences: Optional[List[str]] = None):
    logger.info(f"[pdf_job {job_id}] starting: {source_lang}->{target_lang}, {len(pdf_bytes)} bytes, no_translation={no_translation}")
    async with AsyncSessionLocal() as db:
        try:
            async for event in translate_file_content_pdf_streaming(
                pdf_bytes, source_lang, target_lang, style_guide or "", glossary=glossary_dict, no_translation=no_translation,
                user_role=user_role, user_preferences=user_preferences,
            ):
                if await job_repo.is_cancelled(db, job_id):
                    logger.info(f"[pdf_job {job_id}] cancelled")
                    return

                if event["type"] == "progress":
                    await job_repo.append_event(db, job_id, event)
                elif event["type"] == "done":
                    translated_contents = event["translated_contents"]
                    original_pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
                    result = {
                        "type": "done",
                        "translated_contents": translated_contents,
                        "original_pdf_base64": original_pdf_base64,
                        "glossary_id": glossary_id,  # ADD

                    }
                    await job_repo.append_event(db, job_id, result)
                    await job_repo.mark_done(db, job_id, result)
                    logger.info(f"[pdf_job {job_id}] done")
        except Exception as exc:
            logger.exception(f"[pdf_job {job_id}] failed\n\n Error: {str(exc)}")
            await job_repo.mark_error(db, job_id, str(exc))


async def run_xliff_job(job_id: str, xliff_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None, no_translation: bool = False, user_role: str = "", user_preferences: Optional[List[str]] = None):
    logger.info(f"[xliff_job {job_id}] starting: {source_lang}->{target_lang}, {len(xliff_bytes)} bytes, no_translation={no_translation}")
    async with AsyncSessionLocal() as db:
        try:
            async for event in translate_file_content_xliff_streaming(
                xliff_bytes, source_lang, target_lang, style_guide or "", glossary=glossary_dict, no_translation=no_translation,
                user_role=user_role, user_preferences=user_preferences,
            ):
                if await job_repo.is_cancelled(db, job_id):
                    logger.info(f"[xliff_job {job_id}] cancelled")
                    return

                if event["type"] == "progress":
                    await job_repo.append_event(db, job_id, event)
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
                    await job_repo.append_event(db, job_id, result)
                    await job_repo.mark_done(db, job_id, result)
                    logger.info(f"[xliff_job {job_id}] done")
        except Exception as exc:
            logger.exception(f"[xliff_job {job_id}] failed\n\n Error: {str(exc)}")
            await job_repo.mark_error(db, job_id, str(exc))


async def run_docx_job(job_id: str, docx_bytes: bytes, source_lang: str, target_lang: str, style_guide: str, glossary_dict: dict, glossary_id: Optional[str] = None, no_translation: bool = False, user_role: str = "", user_preferences: Optional[List[str]] = None):
    logger.info(f"[docx_job {job_id}] starting: {source_lang}->{target_lang}, {len(docx_bytes)} bytes, no_translation={no_translation}")
    async with AsyncSessionLocal() as db:
        try:
            async for event in translate_file_content_docx_streaming(
                BytesIO(docx_bytes), source_lang, target_lang, style_guide or "", glossary=glossary_dict, no_translation=no_translation,
                user_role=user_role, user_preferences=user_preferences,
            ):
                if await job_repo.is_cancelled(db, job_id):
                    logger.info(f"[docx_job {job_id}] cancelled")
                    return

                if event["type"] == "progress":
                    await job_repo.append_event(db, job_id, event)
                elif event["type"] == "done":
                    translated_contents = event["translated_contents"]
                    # xliff_output_str = build_xliff_from_scratch(translated_contents, source_lang, target_lang)
                    # if isinstance(xliff_output_str, bytes):
                    #     xliff_output_str = xliff_output_str.decode('utf-8')

                    result = {
                        "type": "done",
                        "translated_contents": [translated_contents],
                        "original_docx_base64":
                            base64.b64encode(docx_bytes).decode("utf-8"),  # ← NEW
                        # "xliff": xliff_output_str,
                        "glossary_id": glossary_id,  # ADD
                    }
                    await job_repo.append_event(db, job_id, result)
                    await job_repo.mark_done(db, job_id, result)
                    logger.info(f"[docx_job {job_id}] done")
        except Exception as exc:
            logger.exception(f"[docx_job {job_id}] failed\n\n Error: {str(exc)}")
            await job_repo.mark_error(db, job_id, str(exc))



# ─────────────────────────────────────────────────────────────────────────────
# "Start job" endpoints — validate input, kick off background work, return
# immediately with a job_id. These no longer stream anything themselves.
# ─────────────────────────────────────────────────────────────────────────────

# NOT USED FOR NOW
@router.post("/pdf")
async def translate_pdf_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    request: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    # Let Pydantic validate the raw JSON string natively
    try:
        request = TranslationRequest.model_validate_json(request)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {str(e)}")  
    
    glossary_id = request.glossary_id
    tm_id = request.tm_id
    source_lang = request.source_lang
    target_lang = request.target_lang
    style_guide = request.style_guide
    no_translation = request.no_translation
    role = request.role
    preferences = request.preferences

    if not file.filename.endswith(".pdf"):
        logger.warning(f"rejected non-pdf upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        logger.warning(f"rejected upload with bad content_type: {file.content_type}")
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")

    if glossary and not glossary.filename.endswith(".tbx"):
            logger.warning(f"rejected glossary upload with invalid extension: {glossary.filename}")
            raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
        
    if translation_memory and not translation_memory.filename.lower().endswith(".tmx"):
        logger.warning(f"rejected translation memory upload with invalid extension: {translation_memory.filename}")
        raise HTTPException(status_code=400, detail="Only .tmx translation memory files are allowed")
    
    try:
        pdf_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded PDF: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read PDF file")

    
    try:
        glossary_bytes = await glossary.read() if glossary else None
        glossary_dict, glossary_id = await _resolve_glossary(db, glossary.filename if glossary else None, glossary_bytes, glossary_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve glossary for {glossary.filename if glossary else None}")
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        tm_bytes = await translation_memory.read() if translation_memory else None
        tm_id = await _resolve_tm(db, translation_memory.filename if translation_memory else None, tm_bytes, tm_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve translation memory for {translation_memory.filename if translation_memory else None}")
        raise HTTPException(status_code=400, detail=str(exc))
    
    clear_doc_summary_cache()

    job_id = await job_repo.create_job(db, file_type="pdf", source_lang=source_lang, target_lang=target_lang)
    logger.info(f"[pdf_job {job_id}] created for {file.filename}, no_translation={no_translation}")
    asyncio.create_task(run_pdf_job(job_id, pdf_bytes, source_lang, target_lang, style_guide, glossary_dict, glossary_id=glossary_id, no_translation=no_translation, user_role=role or "", user_preferences=preferences))
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}


@router.post("/xliff")
async def translate_xliff_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    request: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    # Let Pydantic validate the raw JSON string natively
    try:
        request = TranslationRequest.model_validate_json(request)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {str(e)}")
        
    glossary_id = request.glossary_id
    tm_id = request.tm_id
    source_lang = request.source_lang
    target_lang = request.target_lang
    style_guide = request.style_guide
    no_translation = request.no_translation
    role = request.role
    preferences = request.preferences

    if not file.filename.endswith(".xliff") and not file.filename.endswith(".xlf") and not file.filename.endswith(".sdlxliff") and not file.filename.endswith(".mqxliff"):
        logger.warning(f"rejected non-xliff upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .xliff or .xlf files are allowed")

    if glossary and not glossary.filename.endswith(".tbx"):
        logger.warning(f"rejected glossary upload with invalid extension: {glossary.filename}")
        raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
    
    if translation_memory and not translation_memory.filename.lower().endswith(".tmx"):
        logger.warning(f"rejected translation memory upload with invalid extension: {translation_memory.filename}")
        raise HTTPException(status_code=400, detail="Only .tmx translation memory files are allowed")


    try:
        xliff_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded XLIFF: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read XLIFF file")

    try:
        glossary_bytes = await glossary.read() if glossary else None
        glossary_dict, glossary_id = await _resolve_glossary(db, glossary.filename if glossary else None, glossary_bytes, glossary_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve glossary for {glossary.filename if glossary else None}")
        raise HTTPException(status_code=400, detail=str(exc))
    
    try:
        tm_bytes = await translation_memory.read() if translation_memory else None
        tm_id = await _resolve_tm(db, translation_memory.filename if translation_memory else None, tm_bytes, tm_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve translation memory for {translation_memory.filename if translation_memory else None}")
        raise HTTPException(status_code=400, detail=str(exc))

    clear_doc_summary_cache()

    job_id = await job_repo.create_job(db, file_type="xliff", source_lang=source_lang, target_lang=target_lang)
    logger.info(f"[xliff_job {job_id}] created for {file.filename}, no_translation={no_translation}")
    asyncio.create_task(run_xliff_job(job_id, xliff_bytes, source_lang, target_lang, style_guide, glossary_dict, glossary_id=glossary_id, no_translation=no_translation, user_role=role or "", user_preferences=preferences))
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}


@router.post("/docx")
async def translate_docx_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    request: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    
    # Let Pydantic validate the raw JSON string natively
    try:
        request = TranslationRequest.model_validate_json(request)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {str(e)}")
    
    glossary_id = request.glossary_id
    tm_id = request.tm_id
    source_lang = request.source_lang
    target_lang = request.target_lang
    style_guide = request.style_guide
    no_translation = request.no_translation
    role = request.role
    preferences = request.preferences

    if not file.filename.endswith(".docx"):
        logger.warning(f"rejected non-docx upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .docx files are allowed")
    
    if glossary and not glossary.filename.endswith(".tbx"):
            logger.warning(f"rejected glossary upload with invalid extension: {glossary.filename}")
            raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
        
    if translation_memory and not translation_memory.filename.lower().endswith(".tmx"):
        logger.warning(f"rejected translation memory upload with invalid extension: {translation_memory.filename}")
        raise HTTPException(status_code=400, detail="Only .tmx translation memory files are allowed")
    
    try:
        docx_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded DOCX: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read DOCX file")

    try:
        glossary_bytes = await glossary.read() if glossary else None
        glossary_dict, glossary_id = await _resolve_glossary(db, glossary.filename if glossary else None, glossary_bytes, glossary_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve glossary for {glossary.filename if glossary else None}")
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        tm_bytes = await translation_memory.read() if translation_memory else None
        tm_id = await _resolve_tm(db, translation_memory.filename if translation_memory else None, tm_bytes, tm_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve translation memory for {translation_memory.filename if translation_memory else None}")
        raise HTTPException(status_code=400, detail=str(exc))

    clear_doc_summary_cache()

    job_id = await job_repo.create_job(db, file_type="docx", source_lang=source_lang, target_lang=target_lang)
    logger.info(f"[docx_job {job_id}] created for {file.filename}, no_translation={no_translation}")
    asyncio.create_task(run_docx_job(job_id, docx_bytes, source_lang, target_lang, style_guide, glossary_dict, glossary_id=glossary_id, no_translation=no_translation, user_role=role or "", user_preferences=preferences))
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}

@router.post("/pdf-as-docx")
async def translate_pdf_as_docx(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    translation_memory: UploadFile = File(None),
    request: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    
    # Let Pydantic validate the raw JSON string natively
    try:
        request = TranslationRequest.model_validate_json(request)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {str(e)}")
    
    glossary_id = request.glossary_id
    tm_id = request.tm_id
    source_lang = request.source_lang
    target_lang = request.target_lang
    style_guide = request.style_guide
    no_translation = request.no_translation
    role = request.role
    preferences = request.preferences


    if not file.filename.endswith(".pdf"):
        logger.warning(f"rejected non-pdf upload: {file.filename}")
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        logger.warning(f"rejected upload with bad content_type: {file.content_type}")
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")

    if glossary and not glossary.filename.endswith(".tbx"):
        logger.warning(f"rejected glossary upload with invalid extension: {glossary.filename}")
        raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
    
    if translation_memory and not translation_memory.filename.lower().endswith(".tmx"):
        logger.warning(f"rejected translation memory upload with invalid extension: {translation_memory.filename}")
        raise HTTPException(status_code=400, detail="Only .tmx translation memory files are allowed")

    try:
        pdf_bytes = await file.read()
    except Exception:
        logger.exception(f"failed to read uploaded PDF: {file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read PDF file")

    # ── PDF → DOCX conversion ──
    try:
        docx_bytes = await asyncio.to_thread(_convert_pdf_to_docx_bytes, pdf_bytes)
    except Exception as exc:
        logger.exception("pdf2docx conversion failed")
        raise HTTPException(status_code=500, detail=f"PDF to DOCX conversion failed: {exc}")

    try:
        glossary_bytes = await glossary.read() if glossary else None
        glossary_dict, glossary_id = await _resolve_glossary(db, glossary.filename if glossary else None, glossary_bytes, glossary_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve glossary for {glossary.filename if glossary else None}")
        raise HTTPException(status_code=400, detail=str(exc))


    try:
        tm_bytes = await translation_memory.read() if translation_memory else None
        tm_id = await _resolve_tm(db, translation_memory.filename if translation_memory else None, tm_bytes, tm_id, source_lang, target_lang)
    # Either the file couldn't be read with read() 
    # or the parsing failed
    # or the glossary_id was invalid
    except ValueError as exc:
        logger.exception(f"failed to resolve translation memory for {translation_memory.filename if translation_memory else None}")
        raise HTTPException(status_code=400, detail=str(exc))

    clear_doc_summary_cache()

    job_id = await job_repo.create_job(db, file_type="docx", source_lang=source_lang, target_lang=target_lang)
    logger.info(f"[pdf-as-docx_job {job_id}] created for {file.filename}, no_translation={no_translation}")
    asyncio.create_task(
        run_docx_job(job_id, docx_bytes, source_lang, target_lang, style_guide,
                     glossary_dict, glossary_id=glossary_id, no_translation=no_translation,
                     user_role=role or "", user_preferences=preferences)
    )
    return {"job_id": job_id, "glossary_id": glossary_id, "tm_id": tm_id}