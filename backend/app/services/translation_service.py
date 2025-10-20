import requests

def translate_text(text: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    
    base_url = "https://api.mymemory.translated.net/get"
    params = {
        "q": text,
        "langpair": f"{source_lang}|{target_lang}"
    }

    try:
        response = requests.get(base_url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        raise Exception(f"Network or HTTP error during translation: {e}")
    except ValueError:
        raise Exception("Failed to parse API response as JSON")

    translated = data.get("responseData", {}).get("translatedText")
    if not translated:
        raise Exception("Translation failed or no text returned from API")

    return translated

def translate_file_content(file_content: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    return translate_text(file_content, source_lang, target_lang)