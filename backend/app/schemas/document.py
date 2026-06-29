from pydantic import BaseModel
from typing import List, Literal, Optional

class ReviewDocumentRequest(BaseModel):
    source_lang: str
    target_lang: str
    translated_contents: List[List[dict]] = []
    
class ChatMessage(BaseModel):
    role: Literal["user", "bot"]
    text: str

    
class GeneralChatRequest(BaseModel):
    source_lang: str
    target_lang: str
    translated_contents: List[List[dict]] = []
    chat_history: List[ChatMessage] = [],
    style_guide: str = ""
    review_results: Optional[List[dict]] = []
    model: Literal["deepseek", "gemini", "grok", "claude"] = "claude"
    