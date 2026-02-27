import base64
from io import BytesIO
from typing import List

from app.services.build_pdf import ArabicPDFBuilder


def build_translated_pdf(translated_contents: list, original_pdf_bytes: bytes) -> bytes:
    """
    Builds a translated PDF from translated contents and original PDF bytes.
    Returns the resulting PDF as bytes.
    """
    builder = ArabicPDFBuilder()
    buffer = BytesIO()
    builder.build(translated_pages=translated_contents, original_pdf_bytes=original_pdf_bytes, output=buffer)
    buffer.seek(0)
    return buffer.read()


def build_translated_pdf_base64(translated_contents: list, original_pdf_bytes: bytes) -> str:
    """
    Builds a translated PDF and returns it as a base64-encoded string.
    """
    pdf_bytes = build_translated_pdf(translated_contents, original_pdf_bytes)
    return base64.b64encode(pdf_bytes).decode("utf-8")
