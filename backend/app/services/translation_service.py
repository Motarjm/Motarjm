import requests
from app.config.config import *
from backend.app.config.config import TEMPERATURE
from prompts import *

def translate_text(text: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    sys_prompt = SYSTEM_PROMPT.format(source_lang = source_lang, target_lang = target_lang)
    trans_prompt = TRANSLATE_PROMPT.format(source_lang=source_lang,
                                           target_lang=target_lang,
                                           source_text=text)
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

        # response = requests.get(base_url, params=params, timeout=10)
        # response.raise_for_status()
        # data = response.json()

    except requests.exceptions.RequestException as e:
        raise Exception(f"Network or HTTP error during translation: {e}")
    except ValueError:
        raise Exception("Failed to parse API response as JSON")

    # translated = data.get("responseData", {}).get("translatedText")
    translated = completion.choices[0].message.content
    if not translated:
        raise Exception("Translation failed or no text returned from API")

    return translated

def translate_file_content(file_content: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    return translate_text(file_content, source_lang, target_lang)