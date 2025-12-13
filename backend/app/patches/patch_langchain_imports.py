import sys
import types
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
"""
Compatibility patch for paddleocr expecting:
    from langchain.docstore.document import Document
    from langchain.text_splitter import RecursiveCharacterTextSplitter

    
New Langchain version moved Document to :
    from langchain_core.documents import Document
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    
This patch recreates the old import path so paddleocr does not break
"""

document_module = types.ModuleType("langchain.docstore.document")
document_module.Document = Document
sys.modules["langchain.docstore.document"] = document_module

text_splitter_module = types.ModuleType("langchain.text_splitter")
text_splitter_module.RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter
sys.modules["langchain.text_splitter"] = text_splitter_module

