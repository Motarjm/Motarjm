from pydantic import BaseModel, field_validator, model_validator
from typing import List, Optional
import json


class TranslationRequest(BaseModel):
    """
    Request schema for the multipart translation-start endpoints
    (/translation/pdf, /xliff, /docx, /pdf-as-docx).
    """
    glossary_id: Optional[str] = None
    tm_id: Optional[str] = None
    source_lang: str = "en"
    target_lang: str = "ar"
    style_guide: Optional[str] = None
    no_translation: bool = False
    role: Optional[str] = None
    preferences: List[str] = []

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