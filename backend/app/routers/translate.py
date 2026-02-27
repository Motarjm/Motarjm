import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, Response
from app.services.translation_service import *
from app.services.build_pdf import ArabicPDFBuilder
from app.models.models import TranslationRequest
from io import BytesIO
import base64
from typing import List

router = APIRouter(prefix="/translate", tags=["Translation"])

# @router.post("/text")
# async def translate(request: List[str]):
#     # only used for back translation
#     print(request)
#     if not request:
#         raise HTTPException(status_code=400, detail="Request body is required")

#     translated_texts = translate_list_of_texts(
#         texts=request,
#         # hardcoded for now
#         source_lang="Arabic",
#         target_lang="English"
#     )

#     return translated_texts

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
async def translate_pdf_file_stream(
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
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF file")
    
    def event_stream():
        # send stream of pdf bytes as it is
        for event in translate_file_content_pdf_streaming(pdf_bytes, source_lang, target_lang):
            if event["type"] == "progress":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "done":
                translated_contents = event["translated_contents"]
                
                # build pdf from the translated contents
                builder = ArabicPDFBuilder()
                buffer = BytesIO()
                builder.build(translated_contents, original_pdf_bytes=pdf_bytes, output=buffer)
                
                # 5. Reset buffer position to the start
                buffer.seek(0)
                
                pdf_base64 = base64.b64encode(buffer.read()).decode('utf-8')
                
                final_data = {
                    "type": "done",
                    "translated_contents": translated_contents,
                    "pdf": pdf_base64,
                    "filename": "translated.pdf"
                }
                
                yield f"data: {json.dumps(final_data)}\n\n"
                
    return StreamingResponse(event_stream(), media_type="text/event-stream")

@router.post("/generate-edited-pdf")
async def generate_edited_pdf(request: dict):
    # Extract translated_contents from the dict
    translated_contents = request.get("translated_contents")
    original_pdf = request.get("original_pdf")
    
    if not translated_contents:
        raise HTTPException(status_code=400, detail="translated_contents is required")
    
    # Validate structure
    if not isinstance(translated_contents, list):
        raise HTTPException(status_code=400, detail="translated_contents must be a list")
    
    # Build the PDF
    builder = ArabicPDFBuilder()
    buffer = BytesIO()
    
    builder.build(translated_pages = translated_contents, 
                original_pdf_bytes=base64.b64decode(original_pdf),
                  output=buffer)
    
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=edited_translation.pdf"
        }
    )

@router.post("/explanation")
async def generate_explanation(request: dict):
    # Extract original_text from the dict
    original_text = request.get("block")
    page_context = request.get("page_blocks")

    if not original_text:
        raise HTTPException(status_code=400, detail="original_text is required")
    
    if not page_context:
        raise HTTPException(status_code=400, detail="original_text is required")

    # Call the explanation generation function
    explanation = get_explanation(original_text, page_context)

    return {"explanation": explanation}

@router.post("/suggestions")
async def generate_suggestions(request: dict):
    # Extract original_text from the dict
    original_text = request.get("source_text")
    translation = request.get("translation")
    page_context = request.get("page_blocks")
    source_lang = request.get("sourceLang")
    target_lang = request.get("targetLang")

    if not original_text:
        raise HTTPException(status_code=400, detail="original_text is required")
    
    if not page_context:
        raise HTTPException(status_code=400, detail="original_text is required")
    
    if not translation:
        raise HTTPException(status_code=400, detail="translation is required")

    # Call the suggestion generation function
    suggestions = get_suggestions(original_text, source_lang, translation, target_lang, page_context)

    # Transform {model: text} dict to [{text, model}] list for frontend
    return [{"text": text, "model": model} for model, text in suggestions.items()]

@router.post("/backtranslation")
async def generate_backtranslation_endpoint(request: dict):
    target_text = request.get("target_text")
    source_lang = request.get("source_lang")
    target_lang = request.get("target_lang")
    page_context = request.get("page_blocks")

    if not target_text:
        raise HTTPException(status_code=400, detail="target_text is required")

    if not source_lang or not target_lang:
        raise HTTPException(status_code=400, detail="source_lang and target_lang are required")

    backtranslation = generate_backtranslation(target_text, source_lang, target_lang, page_context)

    return {"backtranslation": backtranslation}


@router.post("/chat")
async def chat_stream(request: dict):
    source_text = request.get("source_text")
    translation = request.get("translation")
    source_lang = request.get("source_lang")
    target_lang = request.get("target_lang")
    page_context = request.get("page_context", [])
    chat_history = request.get("chat_history", [])
    model = request.get("model", "gemini")
    doc_context = request.get("doc_context")

    if not source_text or not translation:
        raise HTTPException(status_code=400, detail="source_text and translation are required")
    if not source_lang or not target_lang:
        raise HTTPException(status_code=400, detail="source_lang and target_lang are required")
    if model not in ("deepseek", "gemini", "grok"):
        raise HTTPException(status_code=400, detail="model must be one of: deepseek, gemini, grok")

    def event_stream():
        try:
            for chunk in stream_chatbot(
                source_text=source_text,
                translation=translation,
                source_lang=source_lang,
                target_lang=target_lang,
                page_context=page_context,
                chat_history=chat_history,
                model=model,
                doc_context=doc_context
            ):
                # print(chunk)
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            raise e
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


