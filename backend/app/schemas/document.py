from pydantic import BaseModel
from typing import List, Literal

class ReviewDocumentRequest(BaseModel):
    source_lang: str
    target_lang: str
    translated_contents: List[List[dict]] = []
