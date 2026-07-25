from app.schemas.translation import TranslationBlockPDF, TranslationBlockXLIFF
from pydantic import BaseModel
from typing import List, Optional


class GenerateEditedPDFRequest(BaseModel):
    translated_contents: List[List[TranslationBlockPDF]]
    bbox: List[float]
    original_pdf: str  # base64-encoded
    
class GenerateXliffRequest(BaseModel):
    translated_contents: List[List[TranslationBlockXLIFF]]
    original_xliff: Optional[str] = None  # None if original was PDF, provided if original was XLIFF
    source_lang: str
    target_lang: str    

class TranslationBlockDocx(BaseModel):
    original_text: str
    translated_text: str
    type: Optional[str] = None
    info: Optional[dict] = None
    

class GenerateDocxRequest(BaseModel):
    translated_contents: List[List[TranslationBlockDocx]]