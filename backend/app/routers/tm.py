import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, Query, Request
from app.services.tm_service import get_tm, search_tm, search_tm_char, _parse_tm
from app.db.session import get_db
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tm", tags=["Translation Memory"])

@router.post("")
async def upload_tm(
    tm_file: UploadFile = File(...),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    db: AsyncSession = Depends(get_db),
):
    if not tm_file.filename.lower().endswith(".tmx"):
        logger.warning(f"rejected translation memory upload with invalid extension: {tm_file.filename}")
        raise HTTPException(status_code=422, detail="Only .tmx translation memory files are allowed")
    try:
        tmx_bytes = await tm_file.read()
    except Exception:
        logger.exception(f"failed to read TMX file: {tm_file.filename}")
        raise HTTPException(status_code=400, detail="Failed to read TMX file")

    try:
        resolved_tm_id = await _parse_tm(db, tm_file.filename, tmx_bytes, source_lang, target_lang)
    except ValueError as exc:
        logger.exception(f"failed to parse TMX file {tm_file.filename}")
        raise HTTPException(status_code=400, detail=str(exc))
        
    entry_count = len(await get_tm(db, resolved_tm_id)) if resolved_tm_id else 0
    return {
        "tm_id": resolved_tm_id,
        "entry_count": entry_count,
        "source_lang": source_lang,
        "target_lang": target_lang,
    }


@router.get("/search")
async def tm_search(
    tm_id: str = Query(...),
    query: str = Query(...),
    top_k: int = Query(5, ge=1, le=20),
    mode: str = Query("token", regex="^(token|char)$"),
    db: AsyncSession = Depends(get_db)
):
    if await get_tm(db, tm_id) is None:
        logger.warning(f"unknown tm_id: {tm_id}")
        raise HTTPException(status_code=404, detail="Unknown or expired tm_id")
    if mode == "char":
        matches = await search_tm_char(db, tm_id, query, top_k=top_k)
    else:
        matches = await search_tm(db, tm_id, query, top_k=top_k)
    return {"matches": matches}


@router.get("/{tm_id}")
async def fetch_tm(tm_id: str,
                    db: AsyncSession = Depends(get_db)):
    entries = await get_tm(db, tm_id)
    if entries is None:
        logger.warning(f"unknown tm_id: {tm_id}")
        raise HTTPException(status_code=404, detail="Unknown or expired tm_id")
    return {"tm_id": tm_id, "entries": [{"source": s, "target": t} for s, t in entries]}