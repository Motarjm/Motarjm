from pydantic import BaseModel
from typing import List


class TranslationBlock(BaseModel):
    original_text: str
    translated_text: str
    bbox: List[float]


class GenerateEditedPDFRequest(BaseModel):
    translated_contents: List[List[TranslationBlock]]
    original_pdf: str  # base64-encoded
