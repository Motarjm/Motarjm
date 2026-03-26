import json
import base64

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.services.translation_service import translate_file_content_pdf_streaming, translate_file_content_xliff_streaming
from app.services.pdf_service import build_translated_pdf_base64
from app.services.xliff_service import build_xliff_bytes, build_xliff
from app.schemas.translation import GenerateEditedPDFRequest

router = APIRouter(prefix="/translation", tags=["Translation"])


@router.post("/pdf")
async def translate_pdf_file(
    file: UploadFile = File(...),
    source_lang: str = "en",
    target_lang: str = "ar",
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")

    try:
        pdf_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read PDF file")

    def event_stream():
        for event in translate_file_content_pdf_streaming(pdf_bytes, source_lang, target_lang):
            if event["type"] == "progress":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "done":
                translated_contents = event["translated_contents"]
                pdf_base64 = build_translated_pdf_base64(translated_contents, pdf_bytes)
                yield f"data: {json.dumps({'type': 'done', 'translated_contents': translated_contents, 'pdf': pdf_base64, 'filename': 'translated.pdf'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/xliff")
async def translate_xliff_file(
    file: UploadFile = File(...),
    source_lang: str = "en",
    target_lang: str = "ar",
):
    if not file.filename.endswith(".xliff") and not file.filename.endswith(".xlf"):
        raise HTTPException(status_code=400, detail="Only .xliff or .xlf files are allowed")
    
    try:
        xliff_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read XLIFF file")

    def event_stream():
        for event in translate_file_content_xliff_streaming(xliff_bytes, source_lang, target_lang):
            if event["type"] == "progress":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "done":
                translated_contents = [event["translated_contents"]]
                
                # Build XLIFF output from translated contents
                xliff_output_str = build_xliff(
                    translated_contents,  # Wrap in list to match expected format
                    source_lang,
                    target_lang
                )
                print(translated_contents)
                yield f"data: {json.dumps({'type': 'done', 'translated_contents': translated_contents, 'xliff': xliff_output_str, 'filename': 'translated.xliff'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
