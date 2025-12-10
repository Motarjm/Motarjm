import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.translation_service import translate_text, translate_file_content_pdf, translate_file_content_txt
from app.models.models import TranslationRequest
from io import BytesIO
from fastapi.responses import StreamingResponse
from app.services.extract_text import extract_text_from_pdf

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
    file: UploadFile = File(...),
    source_lang: str = "en",
    target_lang: str = "ar"
):
    print("filename:", file.filename)
    print("content_type:", file.content_type)
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")
    
    try:
        pdf_bytes = await file.read()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp:
            temp.write(pdf_bytes)
            temp_path = temp.name

        
        content = extract_text_from_pdf(temp_path)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")

    #pdf_file.seek(0)
    output_file = translate_file_content_pdf(content, temp_path, source_lang, target_lang)

    #output_file.seek(0)

    return StreamingResponse(
        output_file,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=translated_{file.filename}"
        }
    )