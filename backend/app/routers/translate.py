from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.services.translation_service import translate_text, translate_file_content

router = APIRouter(prefix="/translate", tags=["Translation"])

class TranslationRequest(BaseModel):
    text: str
    source_lang: str = "en"
    target_lang: str = "ar"

@router.get("/text")
def translate(request: TranslationRequest):
    translated_text = translate_text(
        text=request.text,
        source_lang=request.source_lang,
        target_lang=request.target_lang
    )
    return {"translated_text": translated_text}

@router.post("/file")
async def translate_file(
    file: UploadFile,
    source_lang: str = "en",
    target_lang: str = "ar"
):
    try:
        content = (await file.read()).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file or encoding")

    translated_text = translate_file_content(content, source_lang, target_lang)
    return {"translated_text": translated_text}