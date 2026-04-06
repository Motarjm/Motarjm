from pydantic import BaseModel
from typing import List, Optional


class TranslationBlockPDF(BaseModel):
    original_text: str
    translated_text: str
    
    
class TranslationBlockXLIFF(BaseModel):
    original_text: str
    translated_text: str
    # if the original file is a pdf and i want to generate xliff, there is no id
    id: Optional[str] = None
    
    # legacy: should be removed, 
    # only there cuz if i want to generate xliff while the original file was a pdf, the bbox will be there.
    bbox: Optional[List[float]] = None


class GenerateEditedPDFRequest(BaseModel):
    translated_contents: List[List[TranslationBlockPDF]]
    bbox: List[float]
    original_pdf: str  # base64-encoded
    
class GenerateXliffRequest(BaseModel):
    translated_contents: List[List[TranslationBlockXLIFF]]
    original_xliff: Optional[str] = None  # None if original was PDF, provided if original was XLIFF
    source_lang: str
    target_lang: str    
