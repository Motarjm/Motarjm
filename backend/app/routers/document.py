
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.core.simple_calls import stream_reviewer
from app.schemas.document import ReviewDocumentRequest
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
