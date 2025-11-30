import pdfplumber
from io import BytesIO
import json
from app.services.translation_service import translate_text


def extract_pdf_content(pdf_bytes: bytes) -> dict:
    """
    Extract structured content from PDF file.
    
    Args:
        pdf_bytes: PDF file content as bytes
        
    Returns:
        Dictionary with structured PDF content
    """
    pdf_file = BytesIO(pdf_bytes)
    pages = []
    
    with pdfplumber.open(pdf_file) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            # Extract text preserving newlines
            text = page.extract_text()
            if text:
                # Split into paragraphs (by double newline or single lines)
                paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
                
                page_data = {
                    "page_number": page_num,
                    "paragraphs": paragraphs
                }
                pages.append(page_data)
    
    return {
        "total_pages": len(pages),
        "pages": pages
    }


def translate_pdf_content(pdf_data: dict, source_lang: str = "en", target_lang: str = "ar") -> dict:
    """
    Translate structured PDF content.
    Translates each paragraph individually and preserves structure.
    
    Args:
        pdf_data: Dictionary with structured PDF content
        source_lang: Source language code
        target_lang: Target language code
        
    Returns:
        Dictionary with translated paragraphs
    """
    translated_pages = []
    
    for page in pdf_data["pages"]:
        translated_paragraphs = []
        for paragraph in page["paragraphs"]:
            translated_para = translate_text(paragraph, source_lang, target_lang)
            translated_paragraphs.append(translated_para)
        
        translated_pages.append({
            "page_number": page["page_number"],
            "paragraphs": translated_paragraphs
        })
    
    return {
        "total_pages": pdf_data["total_pages"],
        "pages": translated_pages
    }
