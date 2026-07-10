from io import BytesIO
import os
from threading import Lock
from typing import Dict
import pymupdf
from ultralytics import YOLO
from huggingface_hub import hf_hub_download
# the below line must be imported before paddleocr package to resolve langchain import error
from app.patches.patch_langchain_imports import *
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np
import cv2
from itertools import groupby
import json
import tempfile
import re
from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table

_yolo_models: Dict[str, YOLO] = {}
_ocr_models: Dict[str, PaddleOCR] = {}
_model_init_lock = Lock()


def _nms_numpy(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float = 0.5, ioa_threshold: float = 0.7) -> np.ndarray:
    """Apply non-maximum suppression and return kept indices.
    
    Suppresses boxes based on both IoU (symmetric overlap) and IoA
    (containment — catches cases where a small box sits mostly inside
    a larger one but IoU stays low due to size mismatch).
    """
    if boxes.size == 0:
        return np.array([], dtype=np.int64)

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]

    keep = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)

        if order.size == 1:
            break

        rest = order[1:]

        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])

        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h

        # standard IoU
        union = areas[i] + areas[rest] - inter
        iou = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)

        # IoA: intersection over the SMALLER box's area
        min_area = np.minimum(areas[i], areas[rest])
        ioa = np.divide(inter, min_area, out=np.zeros_like(inter), where=min_area > 0)

        # suppress if either metric says "these are the same region"
        suppress = (iou > iou_threshold) | (ioa > ioa_threshold)
        order = rest[~suppress]

    return np.array(keep, dtype=np.int64)


def _get_yolo_model(device: str = "cpu") -> YOLO:
    """Lazy-load and cache YOLO model per device for process lifetime."""
    if device in _yolo_models:
        return _yolo_models[device]

    with _model_init_lock:
        if device in _yolo_models:
            return _yolo_models[device]

        filepath = hf_hub_download(
            repo_id="Armaggheddon/yolo26-document-layout",
            filename="yolo26s_doc_layout.pt",
            repo_type="model",
        )
        _yolo_models[device] = YOLO(filepath)
        return _yolo_models[device]


def _get_ocr_model(device: str = "cpu") -> PaddleOCR:
    """Lazy-load and cache PaddleOCR model per device for process lifetime."""
    if device in _ocr_models:
        return _ocr_models[device]

    with _model_init_lock:
        if device in _ocr_models:
            return _ocr_models[device]

        _ocr_models[device] = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device=device,
        )
        return _ocr_models[device]

def pdf_to_images(pdf_bytes: bytes):
    """Generator that yields PIL Images one page at a time"""
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page_num in range(len(doc)):
            page = doc[page_num]
            mat = pymupdf.Matrix(1, 1)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            pix = None

            yield np.array(img)


def yolo_predict(image, device="cpu"):
    """
    Returns the result of doclayout-yolo
    The output is a tuple of:
        - a dict mapping classification labels with their description
        - tensor of shape (elements, 6) where elements is the number of detected elements
        and 6 is (x1 y1 x2 y2 conf classification)

    """
    model = _get_yolo_model(device)

    # Perform prediction
    result = model(
        image,
        conf=0.1,
        # disables multi-class classification
        agnostic_nms = True,
        device=device
    )

    # Annotate and save the result
    # result[0].save(filename=f"result.jpg")

    # annotated_frame = result[0].plot(pil=True, line_width=5, font_size=20)
    # cv2.imwrite("result.jpg", annotated_frame)

    # before returning the data, remove overlapping boxes
    
    boxes = result[0].boxes.data[:, :4].detach().cpu().numpy()
    scores = result[0].boxes.conf.detach().cpu().numpy()
    classes = result[0].boxes.cls.detach().cpu().numpy()

    keep = _nms_numpy(boxes, scores, iou_threshold=0.5)

    filtered_boxes = boxes[keep]
    filtered_scores = scores[keep]
    filtered_classes = classes[keep]

    filtered = np.concatenate(
        (filtered_boxes, filtered_scores[:, np.newaxis], filtered_classes[:, np.newaxis]),
        axis=1,
    )
    
    
    # sort from up to bottom, left to right
    box_list = []
    for i in range(len(filtered)):
    # for i in range(len(result[0].boxes.data)): 
        bbox = filtered[i][:4].tolist()
        name_idx = filtered[i][-1].item()
        score = filtered[i][-2].item()
        box_list.append((bbox[0], bbox[1], bbox[2], bbox[3], score, name_idx))

    # Sort by y0 (top) then x0 (left) → reading order
    box_list.sort(key=lambda x: (x[1], x[0]))

    return result[0].names, box_list


def ocr_predict(image, device="cpu"):
    """
    Arguments:
        - image, numpy.array
        
    Returns the result of paddleOCR
    
    The output is a tuple of:
        - List[str], a list of strings of extracted text, line by line
        - List[List[int]], 4 integers per text, representing (x1 y1 x2 y2)

        """
    ocr = _get_ocr_model(device)

    result = ocr.predict(image)

    return result[0]['rec_texts'], list([list(x) for x in result[0]["rec_boxes"]])

def ocr_in_yolo_ioa(ocr_box, yolo_box):
    """
    Check if either ocr_box is inside yolo box or yolo box is inside ocr_box, threshold is 0.5, meaning at least 50% of the smaller box should be inside the bigger box

    Returns:
        True or False
    """
    x1 = max(ocr_box[0], yolo_box[0])
    y1 = max(ocr_box[1], yolo_box[1])
    x2 = min(ocr_box[2], yolo_box[2])
    y2 = min(ocr_box[3], yolo_box[3])

    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter = inter_w * inter_h

    ocr_area = (ocr_box[2] - ocr_box[0]) * (ocr_box[3] - ocr_box[1])
    yolo_area = (yolo_box[2] - yolo_box[0]) * (yolo_box[3] - yolo_box[1])
    minimum_area = min(ocr_area, yolo_area)

    if inter / minimum_area >= 0.5:
      return True
    
    return False


def extract_text_from_image(image, pdf_bytes, doc, c):
    """
    Extracts text from image

    Arguments:
        - image, numpy.array

    Returns:
        - ocr_text List[dict]: Each index represents a block of text in the page
        the dict has 2 keys:
            - 'text': represents the text of the block
            - 'bbox': represents the bounding box of the text, this is the bounding box of yolo with the text extracted using OCR
    """
    
    page = doc[c]
    ocr_result_texts, ocr_result_boxes= ocr_predict(image)
    yolo_result_names, yolo_result_data = yolo_predict(image)

    ocr_text = []

    for block_num in range(len(yolo_result_data)):
        # look for the classification label of this block, is it plain text or figure and so on
        name_idx = yolo_result_data[block_num][-1]
        
        block_bbox = yolo_result_data[block_num][:4]

        # we only need to extract text from those blocks
        # i removed table
        if yolo_result_names[name_idx] not in [ 'Caption',
                                            'Footnote',
                                            'Formula',
                                            'List-item',
                                            'Page-footer',
                                            'Section-header',
                                            'Text',
                                            'Title',"Table"]:

            continue

        # try to get text
        block_text = page.get_text("text", clip=block_bbox)
        # image based content
        if not block_text.strip():
            for i in range(len(ocr_result_texts)):
                # check if small bounding box of the ocr is inside the bigger box of yolo
                if ocr_in_yolo_ioa(ocr_result_boxes[i], block_bbox):
                    block_text += ocr_result_texts[i] + "\n"


        ocr_text.append(
          {
              "text": block_text,
              "bbox": block_bbox
          }
        )

# the below code is for debugging purposes to visualize the extracted text and their bounding boxes, it can be removed later
    
    # Loop through OCR results and draw boxes
    # for item in ocr_text:
    #     text = item["text"]
    #     bbox = item["bbox"]

    #     # print(text, end="\n\n=============\n\n")
        
    #     # Convert bbox coordinates to integers
    #     # bbox format could be: [x1, y1, x2, y2] or [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    #     if len(bbox) == 4 and all(isinstance(x, (int, float)) for x in bbox):
    #         # Rectangle format [x1, y1, x2, y2]
    #         x1, y1, x2, y2 = map(int, bbox)
    #         cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
    #     elif len(bbox) == 4 and all(len(point) == 2 for point in bbox):
    #         # Polygon format [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    #         pts = np.array(bbox, dtype=np.int32)
    #         cv2.polylines(image, [pts], True, (0, 255, 0), 2)
        
    
    # # Save or display result
    # cv2.imwrite(f"tmp/{c}.png", image)
    # cv2.imshow("Output", image)
    # cv2.waitKey(0)
    # cv2.destroyWindow("Output")
    
    return ocr_text

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
    all_content = []
    c = 0
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    for image in pdf_to_images(pdf_bytes):
        all_content.append(
            extract_text_from_image(image, pdf_bytes, doc, c)
        )
        c += 1
    
    return all_content



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
