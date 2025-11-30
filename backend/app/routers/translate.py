from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.translation_service import translate_text, translate_file_content
from app.services.pdf_service import extract_pdf_content, translate_pdf_content
from app.models.models import TranslationRequest


router = APIRouter(prefix="/translate", tags=["Translation"])

@router.get("/text")
def translate(request: TranslationRequest):
    translated_text = translate_text(
        text=request.text,
        source_lang=request.source_lang,
        target_lang=request.target_lang
    )
    return {"translated_text": translated_text}

@router.post("/text_file")
async def translate_txt_file(
    file: UploadFile,
    source_lang: str = "en",
    target_lang: str = "ar"
):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .txt files are allowed")
    if file.content_type not in ["text/plain"]:
        raise HTTPException(status_code=400, detail="Invalid file content type. Expected text/plain")
    
    try:
        content = (await file.read()).decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file or encoding")

    translated_text = translate_file_content_txt(content, source_lang, target_lang)
    return {"translated_text": translated_text}

@router.post("/pdf_file")
async def translate_pdf_file(
    file: UploadFile,
    source_lang: str = "en",
    target_lang: str = "ar"
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type not in ["application/pdf"]:
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")
    
    try:
        pdf_content = await file.read()
        pdf_data = extract_pdf_content(pdf_content)
        translated_data = translate_pdf_content(pdf_data, source_lang, target_lang)
        return translated_data
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")