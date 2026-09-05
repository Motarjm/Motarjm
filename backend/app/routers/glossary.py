import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, Query
from app.services.glossary_service import get_glossary, _parse_glossary
from app.db.session import get_db
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/glossary", tags=["Glossary"])


@router.post("")
async def upload_glossary(
    glossary: UploadFile = File(...),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    db: AsyncSession = Depends(get_db)
):
    if not glossary.filename.endswith(".tbx"):
        logger.warning(f"rejected glossary upload with invalid extension: {glossary.filename}")
        raise HTTPException(status_code=422, detail="Only .tbx glossary files are allowed")
    try:
        tbx_bytes = await glossary.read()
    except Exception:
        logger.exception(f"failed to read TBX glossary: {glossary.filename}")
        raise HTTPException(status_code=400, detail="Failed to read TBX file")

    try:
        glossary_dict, glossary_id = await _parse_glossary(db, glossary.filename, tbx_bytes, source_lang, target_lang)
    except ValueError as exc:
        logger.exception(f"failed to parse glossary {glossary.filename}")
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "glossary_id": glossary_id,
        "terms_count": len(glossary_dict) if glossary_dict else 0,
        "source_lang": source_lang,
        "target_lang": target_lang,
    }
    
    
    
@router.get("/{glossary_id}")
async def fetch_glossary(glossary_id: str,
                         db: AsyncSession = Depends(get_db)):
    terms = await get_glossary(db, glossary_id)
    if terms is None:
        logger.warning(f"unknown glossary_id: {glossary_id}")
        raise HTTPException(status_code=404, detail="Unknown or expired glossary_id")
    return {"glossary_id": glossary_id, "terms": terms}