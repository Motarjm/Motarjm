from io import BytesIO
import requests
from app.config.config import *
from app.core.prompts import *
from app.services.pdf_builder import *
from app.services.extract_text import *

def translate_text(text: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    sys_prompt = SYSTEM_PROMPT.format(source_lang = source_lang, target_lang = target_lang)
    trans_prompt = (TRANSLATE_PROMPT
                    .format(source_lang=source_lang,
                                           target_lang=target_lang,
                                           source_text=text))
    messages = [
        {
            "role":"system",
            "content":sys_prompt
        },
        {
            "role":"user",
            "content":trans_prompt
        }
    ]
    try:
        completion = model.chat.completions.create(
            messages= messages,
            temperature=TEMPERATURE
        )

    except requests.exceptions.RequestException as e:
        raise Exception(f"Network or HTTP error during translation: {e}")
    except ValueError:
        raise Exception("Failed to parse API response as JSON")

    translated = completion.choices[0].message.content
    if not translated:
        raise Exception("Translation failed or no text returned from API")

    return translated

def translate_file_content_txt(file_content: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    return translate_text(file_content, source_lang, target_lang)

def translate_file_content_pdf(pdf_file: BytesIO, source_lang: str = "en", target_lang: str = "ar") -> list[list[dict]]:
    """
    translates file content

    Args:
         - pdf_file, BytesIO: a file stored in RAM, can be used by open() function
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
