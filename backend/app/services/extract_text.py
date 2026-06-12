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
import cv2
import opendataloader_pdf
from itertools import groupby
import json
import tempfile
import re

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



def extract_text_pymupdf(pdf_bytes):
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
    
    
    


def extract_text_from_pdf(pdf_bytes: bytes):
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
 

