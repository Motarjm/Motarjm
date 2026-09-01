import asyncio
import logging
from typing import AsyncGenerator, Dict, List, Optional
import pymupdf
from app.services.pdf_service import extract_text_from_pdf
from app.services.docx_service import get_docx_blocks
from app.services.xliff_service import extract_text_from_xliff
from app.core.graph_models import State
from app.core.workflow import graph
from app.core.simple_calls import terminology_agent
from langdetect import detect
import httpx
from lmnr import observe

logger = logging.getLogger(__name__)

MAX_NUM_SEGMENTS = 200

# Same cap as the old ThreadPoolExecutor(max_workers=5) — bounds how many
# translate_one() calls are in flight concurrently.
TRANSLATE_CONCURRENCY = 5

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


@observe(name="translate_one")
async def translate_one(i: int, page: List[dict], no_translation: bool, source_lang: str, 
                        target_lang: str, style_guide: str, glossary: Optional[Dict[str, str]], 
                        terminology: Optional[str], user_role: str = "", 
                        user_preferences: Optional[List[str]] = None) -> tuple[int, str]:
    """
    Translates a single text segment using the LangGraph pipeline.

    i is the index
    page is a list of blocks: list[dict]
    no_translation: if True, skip translation and return empty string
    source_lang and target_lang are language codes
    style_guide is a string for translation style
    glossary is a dict of source->target terms
    terminology is a string of extracted terminology for the document
    user_role / user_preferences: optional translator profile to apply
    """
    prev_text = page[i - 1]["text"] if i > 0 else ""
    
    if no_translation:
        return i, ""
    
    state = State(
            source_text=page[i]["text"],
            source_lang=source_lang,
            target_lang=target_lang,
            max_iterations=1,
            prev_context=prev_text,
            style_guide=style_guide,
            glossary=glossary or {},
            terminology=terminology or "",
            user_role=user_role or "",
            user_preferences=user_preferences or [],

        )
    
    try:
        response = await graph.ainvoke(state)
    except httpx.HTTPError as e:
        raise RuntimeError(f"Network or HTTP error during translation: {e}")
    except ValueError as e:
        raise RuntimeError(f"Value error during translation: {e}")

    return i, response["current_translation"]

@observe(name="translate_file_pdf")
async def translate_file_content_pdf_streaming(
    pdf_bytes: bytes,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    no_translation: bool = False,
    max_num_segments: int = MAX_NUM_SEGMENTS,
    user_role: str = "",
    user_preferences: Optional[List[str]] = None,
) -> AsyncGenerator[dict, None]:
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
        terminology = await terminology_agent(document=content, 
                                    source_lang=source_lang, 
                                    target_lang=target_lang,
                                    style_guide=style_guide, 
                                    glossary=glossary,
                                    user_preferences=user_preferences)

    for page_num, page in enumerate(content):
        translated_blocks = [None] * len(page)
        semaphore = asyncio.Semaphore(TRANSLATE_CONCURRENCY)

        async def _bounded_translate_one(i, _page=page):
            # Catch here (not after as_completed) so the index i is always
            # known on failure — same as the original's `futures[future]`
            # lookup working even when future.result() raised.
            async with semaphore:
                try:
                    return await translate_one(i, _page, no_translation, source_lang, target_lang, style_guide, glossary, terminology, user_role, user_preferences)
                except Exception as e:
                    logger.warning("Page %d | Block %d failed: %s", page_num, i, e, exc_info=True)
                    return i, ""

        tasks = [asyncio.ensure_future(_bounded_translate_one(i)) for i, _ in enumerate(page)]

        for coro in asyncio.as_completed(tasks):
            i, translated_text = await coro

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
    
@observe(name="translate_file_xliff")
async def translate_file_content_xliff_streaming(
    xliff_bytes: bytes,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    no_translation: bool = False,
    max_num_segments: int = MAX_NUM_SEGMENTS,
    user_role: str = "",
    user_preferences: Optional[List[str]] = None,
) -> AsyncGenerator[dict, None]:
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
        terminology = await terminology_agent(document=segments,
                                        source_lang=source_lang,
                                        target_lang=target_lang,
                                        style_guide=style_guide,
                                        glossary=glossary,
                                        user_preferences=user_preferences)

    semaphore = asyncio.Semaphore(TRANSLATE_CONCURRENCY)

    async def _bounded_translate_one(i):
        async with semaphore:
            try:
                return await translate_one(i, segments, no_translation, source_lang, target_lang, style_guide, glossary, terminology, user_role, user_preferences)
            except Exception as e:
                logger.warning("XLIFF segment %d (id=%s) failed: %s", i, segments[i].get("id"), e, exc_info=True)
                return i, ""

    tasks = [asyncio.ensure_future(_bounded_translate_one(i)) for i, _ in enumerate(segments)]

    for coro in asyncio.as_completed(tasks):
        i, translated_text = await coro

        segment = segments[i]

        translated_content[i] = {
            "original_text": segment["text"],
            "translated_text": translated_text,
            "id": segment["id"],
            }

        completed_segments += 1
        yield {"type": "progress", "completed": completed_segments, "total": total_segments}

    yield {"type": "done", "translated_contents": translated_content}
    
@observe(name="translate_file_docx")
async def translate_file_content_docx_streaming(
    docx_bytes: bytes,
    source_lang: str,
    target_lang: str,
    style_guide: str = "",
    glossary: Optional[Dict[str, str]] = None,
    no_translation: bool = False,
    max_num_segments: int = MAX_NUM_SEGMENTS,
    user_role: str = "",
    user_preferences: Optional[List[str]] = None,
) -> AsyncGenerator[dict, None]:
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
        terminology = await terminology_agent(document=segments,
                                        source_lang=source_lang,
                                        target_lang=target_lang,
                                        style_guide=style_guide,
                                        glossary=glossary,
                                        user_preferences=user_preferences)

    semaphore = asyncio.Semaphore(TRANSLATE_CONCURRENCY)

    async def _bounded_translate_one(i):
        async with semaphore:
            try:
                return await translate_one(i, segments, no_translation, source_lang, target_lang, style_guide, glossary, terminology, user_role, user_preferences)
            except Exception as e:
                logger.warning("DOCX segment %d (id=%s) failed: %s", i, segments[i].get("id"), e, exc_info=True)
                return i, ""

    tasks = [asyncio.ensure_future(_bounded_translate_one(i)) for i, _ in enumerate(segments)]

    for coro in asyncio.as_completed(tasks):
        i, translated_text = await coro

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