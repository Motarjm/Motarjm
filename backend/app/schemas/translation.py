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


