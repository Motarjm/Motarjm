import base64

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO

from app.services.pdf_service import build_translated_pdf
from app.schemas.translation import GenerateEditedPDFRequest

router = APIRouter(prefix="/pdf", tags=["PDF"])


@router.post("/generate")
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
