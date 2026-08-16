import json
import asyncio
import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, Query, Request
from fastapi.responses import StreamingResponse
from io import BytesIO
from app.db.session import get_db
from app.repositories import job_repo 
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Jobs"])

# How long the stream endpoint waits for a new event before sending a keep-alive
# comment and checking again. Keeps the SSE connection alive across proxies.
STREAM_POLL_INTERVAL = 0.5

SSE_HEADERS = {
    "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
}

# ─────────────────────────────────────────────────────────────────────────────
# "Watch job" endpoint — a pure viewer. Disconnecting from this stream (tab
# refresh/close) does NOT touch the background job; reconnecting just replays
# missed events and keeps watching.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/stream/{job_id}")
async def stream_job(request: Request, 
                     job_id: str, 
                     db: AsyncSession = Depends(get_db)):
    job = await job_repo.get(db, job_id)
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

            new_events = await job_repo.events_from(db, job_id, offset)
            for event in new_events:
                yield f"data: {json.dumps(event)}\n\n"
            offset += len(new_events)

            status = await job_repo.status(db, job_id)
            if status in ("done", "error", "cancelled"):
                if status == "error":
                    job = await job_repo.get(db, job_id)
                    error_msg =job.error if job else "Unknown error"
                    logger.error(f"[stream {job_id}] job errored: {error_msg}")
                    yield f"data: {json.dumps({'type': 'error', 'detail': error_msg})}\n\n"
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
async def cancel_job(job_id: str, db: AsyncSession = Depends(get_db)):
    found = await job_repo.request_cancel(db, job_id)
    if not found:
        logger.warning(f"[cancel] unknown job_id: {job_id}")
        raise HTTPException(status_code=404, detail="Unknown job_id")
    logger.info(f"[cancel] job {job_id} cancelled by client")
    print("Client Cancelled Job")
    return {"job_id": job_id, "cancelled": True}