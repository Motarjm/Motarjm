from pydantic import BaseModel
from typing import List, Literal, Optional


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
    role: Literal["user", "bot", "tool"]
    text: str
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict] = None
    content: Optional[str] = None


class ChatRequest(BaseModel):
    source_text: str
    translation: str
    source_lang: str
    target_lang: str
    page_context: List[str] = []
    chat_history: List[ChatMessage] = []
    model: Literal["deepseek", "gemini", "grok", "claude"] = "claude"
    doc_context: List[List[str]] = []
