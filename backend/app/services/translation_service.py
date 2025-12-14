from io import BytesIO
import requests
from app.config.config import *
from app.core.prompts import *
from app.services.extract_text import *
from app.core.workflow import *

# we should use a class that intializes the graph and only invokes it to translation
# instead of initializin each time we need to translate

def translate_text(text: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    graph = build_graph()

    state = State(
        source_text=text,
        source_lang=source_lang,
        target_lang=target_lang)

    try:
        response = graph.invoke(state)

    except requests.exceptions.RequestException as e:
        raise Exception(f"Network or HTTP error during translation: {e}")
    except ValueError:
        raise Exception("Failed to parse API response as JSON")

    translated = response["current_translation"]
    if not translated:
        raise Exception("Translation failed or no text returned from API")

    return translated

def translate_file_content_txt(file_content: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    return translate_text(file_content, source_lang, target_lang)

def translate_file_content_pdf(pdf_file: str, source_lang: str = "en", target_lang: str = "ar") -> list[list[dict]]:
    """
    translates file content

    Args:
         - pdf_file, str: pdf file path
         - source_lang, str: source language to translate from
         - target_lang, str: target language to translate into

    Returns:
        translated_content, List[list[dict]]: outer index represent the different pages
            the inner index represent the different blocks of text inside a page
            The dict contains:
                - text, str: the text in the given block
                - bbox, tuple(int): x0, y0, x1, y1 -> the bounding boxes of the given text
    """
    content = extract_text_from_pdf(pdf_file)

    translated_content = []
    for page in content:
        translated_blocks = []
        for block in page:
            translated_text = translate_text(block["text"], "en", "ar")

            translated_blocks.append({
                "text":translated_text,
                "bbox":block["bbox"]
            })

        translated_content.append(translated_blocks)

    return translated_content


