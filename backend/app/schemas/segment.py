from pydantic import BaseModel
from typing import List, Literal


class ExplanationRequest(BaseModel):
    block: str
    page_blocks: List[str]


class SuggestionsRequest(BaseModel):
    source_text: str
    translation: str
    page_blocks: List[str]
    sourceLang: str
    targetLang: str


class BacktranslationRequest(BaseModel):
    target_text: str
    source_lang: str
    target_lang: str
    page_blocks: List[str]


class ChatMessage(BaseModel):
    role: Literal["user", "bot"]
    text: str


class ChatRequest(BaseModel):
    source_text: str
    translation: str
    source_lang: str
    target_lang: str
    page_context: List[str] = []
    chat_history: List[ChatMessage] = []
    model: Literal["deepseek", "gemini", "grok"] = "gemini"
    doc_context: List[List[str]] = []
