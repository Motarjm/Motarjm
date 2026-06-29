from io import BytesIO
import os
from threading import Lock
from typing import Dict
import pymupdf
# from ultralytics import YOLO
from huggingface_hub import hf_hub_download
# the below line must be imported before paddleocr package to resolve langchain import error
from app.patches.patch_langchain_imports import *
# from paddleocr import PaddleOCR
from PIL import Image
import numpy as np
# import cv2
from itertools import groupby
import json
import tempfile
import re
from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table



ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc",
    "e.g", "i.e", "approx", "dept", "est", "fig", "govt",
    "inc", "ltd", "no", "p", "pp", "vol", "jan", "feb",
    "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
}

def split_sentences(text: str) -> list[str]:
    # Step 1: Protect false periods with a placeholder
    text = protect_false_periods(text)

    # Step 2: Split on real sentence-ending periods
    # Real period = followed by space + uppercase, or end of string
    pattern = r'(?<=[.!?])\s+(?=[A-Z])'
    sentences = re.split(pattern, text)

    # Step 3: Restore placeholders
    sentences = [s.replace("<<<DOT>>>", ".") for s in sentences]

    return [s.strip() for s in sentences if s.strip()]


def protect_false_periods(text: str) -> str:
    # 1. Protect ellipsis
    text = re.sub(r'\.{2,}', lambda m: "<<<DOT>>>" * m.group().count('.'), text)

    # 2. Protect decimals and numbers: 3.14, $4.99, 1,200.50
    text = re.sub(r'(\d)\.(\d)', r'\1<<<DOT>>>\2', text)

    # 3. Protect known abbreviations (case-insensitive)
    abbrev_pattern = r'\b(' + '|'.join(re.escape(a) for a in ABBREVIATIONS) + r')\.(?=\s)'
    text = re.sub(abbrev_pattern, lambda m: m.group(0).replace('.', '<<<DOT>>>'), text, flags=re.IGNORECASE)

    # 4. Protect single uppercase initials: J. K. Rowling
    text = re.sub(r'\b([A-Z])\.(?=\s[A-Z])', r'\1<<<DOT>>>', text)

    # 5. Protect URLs and file extensions
    text = re.sub(r'(\w)\.(com|org|net|pdf|txt|py|js|html|csv|json)\b', r'\1<<<DOT>>>\2', text)

    return text



def extract_text_pymupdf(pdf_bytes) -> list[list[dict]]:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    content = []
    for page_num, page in enumerate(doc):
        page_content = []
        blocks = page.get_text("blocks", sort=True)
        for block in blocks:
            x0, y0, x1, y1, text, block_no, block_type = block
            text = text.strip()
            if block_type == 0:  # 0 = text, 1 = image
                sentences = split_sentences(text)
                # group 3 sentences, instead of single sentences cuz of AI translation
                for i in range(0, len(sentences), 3):
                    group = sentences[i:i + 3]
                    group = " ".join(group)
                    page_content.append({
                        "text": group,
                        "bbox" : (x0, y0, x1, y1)
                    })
                
        content.append(page_content)  
        
    return content
    
    
    


def extract_text_from_pdf(pdf_bytes: bytes)  -> list[list[dict]]:
    """
    Takes a pdf file and returns a List[List[dict]], outer index represent the different pages
    the inner index represent the different blocks of text inside a page

    Arguments:
        - pdf_file, bytes: a stream of bytes representing the pdf file

    Returns:
        - all_content, List[list[dict]]:
            The dict contains:
                - text, str: the text in the given block
                - bbox, tuple(int): x0, y0, x1, y1 -> the bounding boxes of the given text

    """
    return extract_text_pymupdf(pdf_bytes)
 

def iter_unique_cells_table(table):
    """Yield each cell in a table only once, handling both horizontal and vertical merges."""
    seen_tc = set()
    for row in table.rows:
        for cell in row.cells:
            tc = cell._tc
            if tc in seen_tc:
                continue
            seen_tc.add(tc)
            yield cell
#TODO: This function should be more sophiscated to handle first page and even page headers/footers
# also there is duplication
def get_docx_blocks(docx_bytes: bytes) -> list[list[dict]]:
    doc = Document(docx_bytes)
    blocks = []

    # HEADER
    if len(doc.sections) > 0 and doc.sections[0].header:
        for element in doc.sections[0].header._element:
            # Check if the element is a Paragraph (tag ends with 'p')
            if element.tag.endswith('p'):
                # Convert the XML element back to a python-docx Paragraph object
                paragraph = Paragraph(element, doc)
                text = paragraph.text.strip()
                if text:
                    sentences = split_sentences(text)
                    # group 3 sentences, instead of single sentences cuz of AI translation
                    for i in range(0, len(sentences), 3):
                        group = sentences[i:i + 3]
                        group = " ".join(group)
                        
                        blocks.append({
                        "text": group,
                        "bbox": []  # No bounding box for DOCX paragraphs
                        })

            # Check if the element is a Table (tag ends with 'tbl')
            elif element.tag.endswith('tbl'):
                # Convert the XML element back to a python-docx Table object
                table = Table(element, doc)
                for cell in iter_unique_cells_table(table):
                    text = cell.text.strip()
                    if text:
                        blocks.append({
                            "text": text,
                            "bbox": []  # No bounding box for DOCX paragraphs
                        })
                    
                    
    
    # Iterate through the child elements of the document body
    for element in doc.element.body:
        # Check if the element is a Paragraph (tag ends with 'p')
        if element.tag.endswith('p'):
            # Convert the XML element back to a python-docx Paragraph object
            paragraph = Paragraph(element, doc)
            text = paragraph.text.strip()
            if text:
                sentences = split_sentences(text)
                # group 3 sentences, instead of single sentences cuz of AI translation
                for i in range(0, len(sentences), 3):
                    group = sentences[i:i + 3]
                    group = " ".join(group)
                    
                    blocks.append({
                    "text": group,
                    "bbox": []  # No bounding box for DOCX paragraphs
                    })

        # Check if the element is a Table (tag ends with 'tbl')
        elif element.tag.endswith('tbl'):
            # Convert the XML element back to a python-docx Table object
            table = Table(element, doc)
            for cell in iter_unique_cells_table(table):
                text = cell.text.strip()
                if text:
                    blocks.append({
                        "text": text,
                        "bbox": []  # No bounding box for DOCX paragraphs
                    })
                    
                    
    # FOOTER
    if len(doc.sections) > 0 and doc.sections[0].footer:
        for element in doc.sections[0].footer._element:
            # Check if the element is a Paragraph (tag ends with 'p')
            if element.tag.endswith('p'):
                # Convert the XML element back to a python-docx Paragraph object
                paragraph = Paragraph(element, doc)
                text = paragraph.text.strip()
                if text:
                    sentences = split_sentences(text)
                    # group 3 sentences, instead of single sentences cuz of AI translation
                    for i in range(0, len(sentences), 3):
                        group = sentences[i:i + 3]
                        group = " ".join(group)
                        
                        blocks.append({
                        "text": group,
                        "bbox": []  # No bounding box for DOCX paragraphs
                        })

            # Check if the element is a Table (tag ends with 'tbl')
            elif element.tag.endswith('tbl'):
                # Convert the XML element back to a python-docx Table object
                table = Table(element, doc)
                for cell in iter_unique_cells_table(table):
                    text = cell.text.strip()
                    if text:
                        blocks.append({
                            "text": text,
                            "bbox": []  # No bounding box for DOCX paragraphs
                        })
    
    return blocks