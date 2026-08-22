from pydantic import BaseModel
from typing import List, Literal, Optional

class ReviewDocumentRequest(BaseModel):
    source_lang: str
    target_lang: str
    translated_contents: List[List[dict]] = []
    
class ChatMessage(BaseModel):
    role: Literal["user", "bot", "tool"]
    text: Optional[str] = None
    # for tool calls
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    args: Optional[dict] = None
    content: Optional[str] = None

    
class GeneralChatRequest(BaseModel):
    source_lang: str
    target_lang: str
    translated_contents: List[List[dict]] = []
    chat_history: List[ChatMessage] = [],
    style_guide: str = ""
    review_results: Optional[List[dict]] = []
    model: Literal["deepseek", "gemini", "grok", "claude"] = "claude"
    role: Optional[str] = ""
    preferences: List[str] = None
    
class ExtractTermsRequest(BaseModel):
    translated_contents: List[List[dict]]  # same shape as GeneralChatRequest's field
    source_lang: str
    target_lang: str
    style_guide: Optional[str] = None
    glossary: Optional[dict] = None