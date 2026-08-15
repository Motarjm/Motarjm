import requests
from typing import Dict, Generator, List, Optional
import pymupdf
from app.services.pdf_extract_text import extract_text_from_pdf
from app.services.docx_service import get_docx_blocks
from app.services.xliff_service import extract_text_from_xliff
from app.core.graph_models import State
from app.core.workflow import graph
from app.core.simple_calls import terminology_agent
from app.services.build_pdf import ArabicPDFBuilder
from concurrent.futures import ThreadPoolExecutor, as_completed
from langdetect import detect

MAX_NUM_SEGMENTS = 200

def is_image_based(pdf_bytes: bytes, sample_pages: int = 5) -> bool:
    """
    Checks if a PDF is image-based by sampling the first few pages and looking for text.
    Returns True if no text is found in the sampled pages, indicating it's likely image-based.
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pages_to_check = min(sample_pages, len(doc))
    
    text_found = 0
    for i in range(pages_to_check):
        text = doc[i].get_text().strip()
        if text:
            text_found += 1
    
    doc.close()
    return text_found == 0  # True = image-based

def translate_text(
    text: str,
    prev_text: str,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    terminology: Optional[str] = None,
) -> str:
    """
    Translates a single text segment using the LangGraph pipeline.
    """
    state = State(
        source_text=text,
        source_lang=source_lang,
        target_lang=target_lang,
        max_iterations=2,
        prev_context=prev_text,
        style_guide=style_guide,
        glossary=glossary or {},
        terminology=terminology or "",
    )

    try:
        response = graph.invoke(state)
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Network or HTTP error during translation: {e}")
    except ValueError as e:
        raise RuntimeError(f"Failed to parse API response: {e}")

    return response["current_translation"]


def translate_one(i, page, no_translation, source_lang, target_lang, style_guide, glossary, terminology):
    """
    i is the index
    page is a list of blocks: list[dict]
    """
    prev_text = page[i - 1]["text"] if i > 0 else ""
    
    if no_translation:
        return i, ""
    
    translated = translate_text(
        page[i]["text"], prev_text, source_lang, target_lang,
        style_guide, glossary=glossary, terminology=terminology
    )
    
    return i, translated
    
    
def translate_file_content_pdf_streaming(
    pdf_bytes: bytes,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    no_translation: bool = False,
    max_num_segments: int = MAX_NUM_SEGMENTS
) -> Generator[dict, None, None]:
    """
    Translates all text blocks in a PDF, yielding progress and done events.
    If no_translation is True, the file is only segmented/extracted and the
    "translated_text" for every block is left empty ("").

    Yields:
        {"type": "progress", "completed": int, "total": int}
        {"type": "done", "translated_contents": List[List[dict]]}

    Each block in translated_contents:
        {"original_text": str, "translated_text": str, "bbox": list}
    """
    
    content = extract_text_from_pdf(pdf_bytes)
    if len(content) > max_num_segments:
        raise ValueError(f"max segments exceeded: {len(content)} > {max_num_segments}")    # doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    
    detection_text = "\n".join([segment["text"] for segment in content[0]])
    if detect(detection_text) != source_lang:
        raise ValueError(f"Detected source language '{detect(detection_text)}' does not match provided source language '{source_lang}'.")
    # builder = ArabicPDFBuilder()

    # for page_index, page_blocks in enumerate(content):
    #     page = doc[page_index]
    #     ordered_blocks = builder.return_reading_order(
    #         page_blocks, page.rect.width, page.rect.height
    #     )
    #     ordered_content.append(ordered_blocks)

    total_blocks = sum(len(page) for page in content)
    completed_blocks = 0
    translated_content = []
    terminology = {}
    if not no_translation:
        terminology = terminology_agent(document=content, 
                                    source_lang=source_lang, 
                                    target_lang=target_lang,
                                    style_guide=style_guide, 
                                    glossary=glossary)

    for page_num, page in enumerate(content):
        translated_blocks = [None] * len(page)
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(translate_one, i, page ,no_translation, source_lang, target_lang, style_guide, glossary, terminology): i for i, _ in enumerate(page)}
            
            for future in as_completed(futures):
                i = futures[future]
                try:
                    _, translated_text = future.result()
                except Exception as e:
                    print(f"Page {page_num} | Block {i} failed: {e}")
                    translated_text = ""
                    
                block = page[i]
                
                translated_blocks[i] = {
                    "original_text": block["text"],
                    "translated_text": translated_text,
                    "bbox": block["bbox"],
                    "type": block.get("type", "Text"),
                    "info": block.get("info", {}),
                    }
                
                completed_blocks += 1
                
                yield {"type": "progress", 
                       "completed": completed_blocks,
                       "total": total_blocks}
                
        translated_content.append(translated_blocks)
    yield {"type": "done", "translated_contents": translated_content}
    
def translate_file_content_xliff_streaming(
    xliff_bytes: bytes,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    no_translation: bool = False,
    max_num_segments: int = MAX_NUM_SEGMENTS
) -> Generator[dict, None, None]:
    """
    Translates all text segments in an XLIFF file, yielding progress and done events.
    
    Unlike PDF translation, XLIFF does not require text extraction, reordering, or bbox handling.
    It simply processes source segments in order.

    If no_translation is True, the file is only segmented/extracted (no LLM calls are
    made, including terminology extraction) and "translated_text" is left empty ("")
    for every segment.

    Yields:
        {"type": "progress", "completed": int, "total": int}
        {"type": "done", "translated_contents": List[dict]}

    Each item in translated_contents:
        {"original_text": str, "translated_text": str, "id": str}
    """
    
    # Extract segments from XLIFF file
    segments = extract_text_from_xliff(xliff_bytes)
    
    if len(segments) > max_num_segments:
        raise ValueError(f"max segments exceeded: {len(segments)} > {max_num_segments}")

    detection_text = "\n".join([segment["text"] for segment in segments])
    if detect(detection_text) != source_lang:
        raise ValueError(f"Detected source language '{detect(detection_text)}' does not match provided source language '{source_lang}'.")

    total_segments = len(segments)
    completed_segments = 0
    translated_content = [None] * total_segments

    terminology = {}
    if not no_translation:
        terminology = terminology_agent(document=segments,
                                        source_lang=source_lang,
                                        target_lang=target_lang,
                                        style_guide=style_guide,
                                        glossary=glossary)

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(translate_one, i, segments ,no_translation, source_lang, target_lang, style_guide, glossary, terminology): i for i, _ in enumerate(segments)}
        
        for future in as_completed(futures):
            i = futures[future]
            try:
                _, translated_text = future.result()
            except Exception as e:
                translated_text = ""
                
            segment = segments[i]
            
            translated_content[i] = {
                "original_text": segment["text"],
                "translated_text": translated_text,
                "id": segment["id"],
                }
    
            completed_segments += 1
            yield {"type": "progress", "completed": completed_segments, "total": total_segments}
            
    yield {"type": "done", "translated_contents": translated_content}


def translate_file_content_docx_streaming(
    docx_bytes: bytes,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    no_translation: bool = False,
    max_num_segments: int = MAX_NUM_SEGMENTS
) -> Generator[dict, None, None]:
    """
    Translates all text segments in an DOCX file, yielding progress and done events.

    Unlike PDF translation, DOCX does not require text extraction, reordering, or bbox handling.
    It simply processes source segments in order.

    If no_translation is True, the file is only segmented/extracted (no LLM calls are
    made, including terminology extraction) and "translated_text" is left empty ("")
    for every segment.

    Yields:
        {"type": "progress", "completed": int, "total": int}
        {"type": "done", "translated_contents": List[dict]}

    Each item in translated_contents:
        {"original_text": str, "translated_text": str, "id": str}
    """
    
    # Extract segments from DOCX file
    _, segments = get_docx_blocks(docx_bytes)
    
    if len(segments) > max_num_segments:
        raise ValueError(f"max segments exceeded: {len(segments)} > {max_num_segments}")    # doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    
    # ToDo: This wont work with dialects
    detection_text = "\n".join([segment["text"] for segment in segments])
    if detect(detection_text) != source_lang:
        raise ValueError(f"Detected source language '{detect(detection_text)}' does not match provided source language '{source_lang}'.")


    total_segments = len(segments)
    completed_segments = 0
    translated_content = [None] * total_segments

    terminology = {}
    if not no_translation:
        terminology = terminology_agent(document=segments,
                                        source_lang=source_lang,
                                        target_lang=target_lang,
                                        style_guide=style_guide,
                                        glossary=glossary)

    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(translate_one, i, segments ,no_translation, source_lang, target_lang, style_guide, glossary, terminology): i for i, _ in enumerate(segments)}
        
        for future in as_completed(futures):
            i = futures[future]
            try:
                _, translated_text = future.result()
            except Exception as e:
                translated_text = ""
                
            segment = segments[i]
            
            translated_content[i] = {    
                "original_text": segment["text"],
                "translated_text": translated_text,
                "id": segment.get("id"),       # ← NEW
                "type": segment.get("type", "Text"),
                "info": segment.get("info", {}),
                }
    
            completed_segments += 1
            yield {"type": "progress", "completed": completed_segments, "total": total_segments}

    yield {"type": "done", "translated_contents": translated_content}