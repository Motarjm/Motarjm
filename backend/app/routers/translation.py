import json
import base64

from fastapi import APIRouter, File, HTTPException, UploadFile, Query
from fastapi.responses import StreamingResponse

from app.services.translation_service import translate_file_content_pdf_streaming, translate_file_content_xliff_streaming
from app.services.glossary_service import parse_tbx_basic, store_glossary
from app.services.pdf_service import build_translated_pdf_base64
from app.services.xliff_service import build_xliff
from app.schemas.translation import GenerateEditedPDFRequest
from app.core.simple_calls import clear_doc_summary_cache

router = APIRouter(prefix="/translation", tags=["Translation"])
MAX_UPLOAD_SIZE_MB = 5
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024


async def read_with_limit(upload: UploadFile, read_error_detail: str, size_error_detail: str) -> bytes:
    try:
        data = await upload.read(MAX_UPLOAD_SIZE_BYTES + 1)
    except Exception:
        raise HTTPException(status_code=400, detail=read_error_detail)
    if len(data) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=size_error_detail)
    return data


@router.post("/pdf")
async def translate_pdf_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    style_guide: str = Query(None),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Expected application/pdf")

    pdf_bytes = await read_with_limit(
        file,
        read_error_detail="Failed to read PDF file",
        size_error_detail="File size exceeds 5MB limit",
    )

    glossary_dict = {}
    if glossary:
        if not glossary.filename.endswith(".tbx"):
            raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
        tbx_bytes = await read_with_limit(
            glossary,
            read_error_detail="Failed to read TBX file",
            size_error_detail="Glossary file size exceeds 5MB limit",
        )

        try:
            glossary_dict = parse_tbx_basic(
                tbx_bytes,
                source_lang=source_lang,
                target_lang=target_lang,
            )
            
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        glossary_dict = glossary_dict or {}
        store_glossary(glossary_dict)

    # Clear cached document summary for new document
    clear_doc_summary_cache()

    def event_stream():
        for event in translate_file_content_pdf_streaming(
            pdf_bytes,
            source_lang,
            target_lang,
            style_guide or "",
            glossary=glossary_dict,
        ):
            if event["type"] == "progress":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "done":
                translated_contents = event["translated_contents"]
                pdf_base64 = build_translated_pdf_base64(translated_contents, pdf_bytes)
                yield f"data: {json.dumps({'type': 'done', 'translated_contents': translated_contents, 'pdf': pdf_base64})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                                 headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })


@router.post("/xliff")
async def translate_xliff_file(
    file: UploadFile = File(...),
    glossary: UploadFile = File(None),
    source_lang: str = Query("en"),
    target_lang: str = Query("ar"),
    style_guide: str = Query(None),
):
    if not file.filename.endswith(".xliff") and not file.filename.endswith(".xlf") and not file.filename.endswith(".sdlxliff") and not file.filename.endswith(".mqxliff"):
        raise HTTPException(status_code=400, detail="Only .xliff or .xlf files are allowed")
    
    xliff_bytes = await read_with_limit(
        file,
        read_error_detail="Failed to read XLIFF file",
        size_error_detail="File size exceeds 5MB limit",
    )

    glossary_dict = {}
    if glossary:
        if not glossary.filename.endswith(".tbx"):
            raise HTTPException(status_code=400, detail="Only .tbx glossary files are allowed")
        tbx_bytes = await read_with_limit(
            glossary,
            read_error_detail="Failed to read TBX file",
            size_error_detail="Glossary file size exceeds 5MB limit",
        )

        try:
            glossary_dict = parse_tbx_basic(
                tbx_bytes,
                source_lang=source_lang,
                target_lang=target_lang,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        glossary_dict = glossary_dict or {}
        store_glossary(glossary_dict)

    # Clear cached document summary for new document
    clear_doc_summary_cache()

    def event_stream():
        for event in translate_file_content_xliff_streaming(
            xliff_bytes,
            source_lang,
            target_lang,
            style_guide or "",
            glossary=glossary_dict,
        ):
            if event["type"] == "progress":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "done":
                translated_contents = event["translated_contents"]
                
                # Build XLIFF output from translated contents
                # xliff_output_str = build_xliff(
                #     translated_contents,  # Wrap in list to match expected format
                #     source_lang,
                #     target_lang
                # )
                xliff_output_str, _ = build_xliff(
                    xliff_bytes ,
                    translated_contents,  
                )
                # Convert bytes to string
                if isinstance(xliff_output_str, bytes):
                    xliff_output_str = xliff_output_str.decode('utf-8')

                
                # print(translated_contents)
                # frontend needs that translated_contents to be a nested list
                yield f"data: {json.dumps({'type': 'done', 'translated_contents': [translated_contents], 'xliff': xliff_output_str})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                                 headers={
            "X-Accel-Buffering": "no",    # disables buffering in Nginx AND Cloudflare
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        })
