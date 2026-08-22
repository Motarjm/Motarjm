from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.core.simple_calls import stream_reviewer, stream_general_chatbot, terminology_agent
from app.schemas.document import ReviewDocumentRequest, GeneralChatRequest, ExtractTermsRequest
from app.services.generate_glossary_service import get_stored_file
import json
import logging
import io
from openpyxl import Workbook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/document", tags=["Document"])


@router.post("/review")
async def review_document(request: ReviewDocumentRequest):
    translated_contents = request.translated_contents
    source_lang = request.source_lang
    target_lang = request.target_lang
    def event_stream():
        try:
            for chunk in stream_reviewer(
                doc_context=translated_contents,
                source_lang=source_lang,
                target_lang=target_lang,
                user_role=request.role,
                user_preferences=request.preferences,
            ):
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.exception("document review stream failed")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                                 headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })


@router.post("/extract-terms")
async def extract_terms(request: ExtractTermsRequest):
    """
    Runs the terminology agent over the document and returns an .xlsx
    file with two columns: Source and Target.
    """
    # terminology_agent expects each block to have a "text" key (the source
    # text to extract terminology from) — translated_contents instead comes
    # from the frontend with "original_text"/"translated_text" keys, so we
    # remap it here rather than touching terminology_agent's contract.
    document = [
        [{"text": block["original_text"]} for block in page]
        for page in request.translated_contents
    ]

    try:
        result = terminology_agent(
            document=document,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            style_guide=request.style_guide or "",
            glossary=request.glossary or {},
        )
    except Exception as e:
        logger.exception("terminology extraction failed")
        raise HTTPException(status_code=500, detail=str(e))
    
    try:
        terms = json.loads(result) if isinstance(result, str) else result
    except (json.JSONDecodeError, TypeError):
        logger.error("terminology agent returned non-JSON output: %s", result)
        raise HTTPException(status_code=502, detail="Terminology agent returned an unparseable response")
    
    
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
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="terminology.xlsx"',
        },
    )


# ── NEW: serve terminology files stashed by the extract_terminology tool ──
@router.get("/terms-download/{file_id}")
async def download_terms(file_id: str):
    """
    Retrieves a terminology .xlsx file from the in-memory tool file store.
    """
    file_entry = get_stored_file(file_id)
    if not file_entry:
        raise HTTPException(status_code=404, detail="File not found or expired")

    return StreamingResponse(
        io.BytesIO(file_entry["content"]),
        media_type=file_entry["media_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{file_entry["filename"]}"'
        },
    )


@router.post("/chat")
async def general_chat(request: GeneralChatRequest):
    chat_history = [msg.model_dump() for msg in request.chat_history]

    def event_stream():
        try:
            for chunk in stream_general_chatbot(
                source_lang=request.source_lang,
                target_lang=request.target_lang,
                chat_history=chat_history,
                doc_context=request.translated_contents,
                style_guide=request.style_guide or "",
                review_results=request.review_results or [],
                model=request.model,
                user_role=request.role,
                user_preferences=request.preferences,
            ):
                # Structured events (tool_start / tool_call) come through as dicts,
                # plain text tokens come through as strings.
                if isinstance(chunk, dict):
                    yield f"data: {json.dumps(chunk)}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.exception("general chat stream failed")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                                 headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })