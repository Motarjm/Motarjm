from pydantic import BaseModel
from typing import List


class TranslationBlock(BaseModel):
    original_text: str
    translated_text: str
    


class GenerateEditedPDFRequest(BaseModel):
    translated_contents: List[List[TranslationBlock]]
    bbox: List[float]
    original_pdf: str  # base64-encoded
    
class GenerateXliffRequest(BaseModel):
    translated_contents: List[List[TranslationBlock]]
    source_lang: str
    target_lang: str    
