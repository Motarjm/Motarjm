import base64

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO

from app.services.pdf_service import build_translated_pdf
from app.services.xliff_service import build_xliff_bytes
from app.schemas.translation import GenerateEditedPDFRequest, GenerateXliffRequest

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
        headers={"Content-Disposition": "attachment; filename=edited_translation.pdf"},
    )


@router.post("/xliff")
async def generate_xliff(request: GenerateXliffRequest):
    """
    Generates an XLIFF file from translated contents.
    XLIFF is a standard XML format for localization/translation exchange.
    """
    # Convert Pydantic models to plain dicts for the XLIFF builder
    translated_contents = [
        [block.model_dump() for block in page]
        for page in request.translated_contents
    ]
    
    # Extract language codes from request (or use defaults)
    source_lang = getattr(request, 'source_lang')
    target_lang = getattr(request, 'target_lang')
    
    xliff_bytes = build_xliff_bytes(translated_contents, source_lang, target_lang)

    return StreamingResponse(
        BytesIO(xliff_bytes),
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=translation.xliff"},
    )
