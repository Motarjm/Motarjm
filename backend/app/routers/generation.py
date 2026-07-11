import base64

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from app.services.pdf_service import build_translated_pdf
from app.services.xliff_service import build_xliff, build_xliff_from_scratch
from app.services.docx_service import build_docx
from app.schemas.generation import GenerateDocxRequest, GenerateEditedPDFRequest, GenerateXliffRequest

router = APIRouter(prefix="/generation", tags=["Generation"])


@router.post("/pdf")
async def generate_edited_pdf(request: GenerateEditedPDFRequest):
    original_pdf_bytes = base64.b64decode(request.original_pdf)
    # Convert Pydantic models to plain dicts for the PDF builder
    translated_contents = [
        [block.model_dump() for block in page]
        for page in request.translated_contents
    ]
    pdf_bytes = build_translated_pdf(translated_contents, original_pdf_bytes)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
            headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("/xliff")
async def generate_xliff(request: GenerateXliffRequest):
    """
    Generates an XLIFF file from translated contents.
    XLIFF is a standard XML format for localization/translation exchange.
    
    Two cases:
    1. original_xliff is provided: Modify existing XLIFF (user uploaded XLIFF)
    2. original_xliff is None/empty: Build XLIFF from scratch (user uploaded PDF)
    """
    # Convert Pydantic models to plain dicts for the XLIFF builder
    translated_contents = [
        [block.model_dump() for block in page]
        for page in request.translated_contents
    ]
    translated_contents = translated_contents[0]

    # Extract language codes from request
    source_lang = getattr(request, 'source_lang')
    target_lang = getattr(request, 'target_lang')
    
    # Determine whether to modify existing or build from scratch
    if request.original_xliff:
        # Case 1: User uploaded XLIFF - modify existing file
        original_xliff_bytes = request.original_xliff.encode('utf-8')
        xliff_bytes, _ = build_xliff(original_xliff_bytes, translated_contents)
    else:
        # Case 2: User uploaded PDF - build XLIFF from scratch
        xliff_bytes = build_xliff_from_scratch(translated_contents, source_lang, target_lang)

    return StreamingResponse(
        BytesIO(xliff_bytes),
        media_type="application/xml",
            headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
        
    )


@router.post("/docx")
async def generate_docx(request: GenerateDocxRequest):
    """
    Generates a DOCX file from translated contents.
    DOCX is a standard format for word processing documents.
    
    """
    # Convert Pydantic models to plain dicts for the XLIFF builder
    translated_contents = [
        [block.model_dump() for block in page]
        for page in request.translated_contents
    ]
        
    docx_bytes = build_docx(translated_contents)

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
        
    )
