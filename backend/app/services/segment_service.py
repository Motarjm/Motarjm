from typing import List, AsyncGenerator, Optional, Union

from app.core.simple_calls import (
    generate_explanation,
    generate_suggestions,
    generate_backtranslation,
    stream_chatbot,
)


async def get_explanation(source_text: str, page_context: List[str]) -> str:
    return await generate_explanation(source_text, page_context)


async def get_suggestions(
    source_text: str,
    source_lang: str,
    translation: str,
    target_lang: str,
    page_context: List[str],
    style_guide: str = "",
) -> dict:
    return await generate_suggestions(source_text, source_lang, translation, target_lang, page_context, style_guide)


async def get_backtranslation(
    target_text: str,
    source_lang: str,
    target_lang: str,
    page_context: List[str],
) -> str:
    return await generate_backtranslation(target_text, source_lang, target_lang, page_context)


async def stream_chat_response(
    source_text: str,
    translation: str,
    source_lang: str,
    target_lang: str,
    page_context: List[str],
    chat_history: List[dict],
    model: str,
    doc_context: List[List[str]],
    style_guide: str = "",
    user_role: str = "",
    user_preferences: Optional[List[str]] = None,
) -> AsyncGenerator[Union[str, dict], None]:
    async for chunk in stream_chatbot(
        source_text=source_text,
        translation=translation,
        source_lang=source_lang,
        target_lang=target_lang,
        page_context=page_context,
        chat_history=chat_history,
        model=model,
        doc_context=doc_context,
        style_guide=style_guide,
        user_role =user_role,
        user_preferences=user_preferences,
        
    ):
        yield chunk