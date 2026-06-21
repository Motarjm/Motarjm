
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.core.simple_calls import stream_reviewer, stream_general_chatbot
from app.schemas.document import ReviewDocumentRequest, GeneralChatRequest
import json


router = APIRouter(prefix="/document")


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
                target_lang=target_lang
            ):
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                                 headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })

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
                model=request.model
            ):
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            raise e
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                                 headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })
