import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.schemas.segment import (
    BacktranslationRequest,
    ChatRequest,
    ExplanationRequest,
    SuggestionsRequest,
)
from app.services.segment_service import (
    get_backtranslation,
    get_explanation,
    get_suggestions,
    stream_chat_response,
)

router = APIRouter(prefix="/segment", tags=["Segment"])


@router.post("/explanation")
async def explanation(request: ExplanationRequest):
    result = get_explanation(request.block, request.page_blocks)
    return {"explanation": result}


@router.post("/suggestions")
async def suggestions(request: SuggestionsRequest, style_guide: str = Query(None)):
    result = get_suggestions(
        request.source_text,
        request.sourceLang,
        request.translation,
        request.targetLang,
        request.page_blocks,
        style_guide or "",
    )
    return [{"text": text, "model": model} for model, text in result.items()]


@router.post("/backtranslation")
async def backtranslation(request: BacktranslationRequest):
    result = get_backtranslation(
        request.target_text,
        request.source_lang,
        request.target_lang,
        request.page_blocks,
    )
    return {"backtranslation": result}


@router.post("/chat")
async def chat(request: ChatRequest, style_guide: str = Query(None)):
    chat_history = [msg.model_dump() for msg in request.chat_history]

    def event_stream():
        try:
            for chunk in stream_chat_response(
                source_text=request.source_text,
                translation=request.translation,
                source_lang=request.source_lang,
                target_lang=request.target_lang,
                page_context=request.page_context,
                chat_history=chat_history,
                model=request.model,
                doc_context=request.doc_context,
                style_guide=style_guide or "",
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
