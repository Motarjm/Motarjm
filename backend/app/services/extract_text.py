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
from app.services.pdf_utils import PdfSource, open_pdf


_yolo_models: Dict[str, YOLO] = {}
_ocr_models: Dict[str, PaddleOCR] = {}
_model_init_lock = Lock()


def _nms_numpy(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float = 0.5) -> np.ndarray:
    """Apply non-maximum suppression and return kept indices."""
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
        union = areas[i] + areas[rest] - inter
        iou = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)

        order = rest[iou <= iou_threshold]

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
            filename="yolo26n_doc_layout.pt",
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

def pdf_to_images(pdf_source: PdfSource):
    """Generator that yields PIL Images one page at a time"""
    with open_pdf(pdf_source) as doc:
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
        conf=0.5,
        device=device
    )

    # Annotate and save the result
    #annotated_frame = result[0].plot(pil=True, line_width=5, font_size=20)
    #cv2.imwrite("result.jpg", annotated_frame)
    
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
    
    return result[0].names, filtered


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


def is_bbox_inside(small_bbox, large_bbox, tolerance=5):
    """
    Check if small bbox is inside large bbox, bbox for bounding box
    Allow small margin of error

    Returns:
        True or False
    """
    return (small_bbox[0] >= large_bbox[0] - tolerance and
            small_bbox[1] >= large_bbox[1] - tolerance and
            small_bbox[2] <= large_bbox[2] + tolerance and
            small_bbox[3] <= large_bbox[3] + tolerance)



def extract_text_from_image(image):
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

    ocr_result_texts, ocr_result_boxes= ocr_predict(image)
    yolo_result_names, yolo_result_data = yolo_predict(image)
    ocr_text = []

    for block_num in range(len(yolo_result_data)):

        block_text = ""

        # look for the classification label of this block, is it plain text or figure and so on
        name_idx = yolo_result_data[block_num][-1].item()

        # we only need to extract text from a block of plain text or title
        if yolo_result_names[name_idx] not in ["Section-header", "Text", "Title"]:
            continue

        block_bbox = yolo_result_data[block_num][:4].tolist()

        for i in range(len(ocr_result_texts)):
            # check if small bounding box of the ocr is inside the bigger box of yolo
            if is_bbox_inside(ocr_result_boxes[i], block_bbox, tolerance=8):
              block_text += ocr_result_texts[i] + "\n"

        ocr_text.append(
          {
              "text": block_text,
              "bbox": block_bbox
          }
        )

    return ocr_text


def extract_text_from_pdf(pdf_source: PdfSource):
    """
    Takes a pdf file and returns a List[List[dict]], outer index represent the different pages
    the inner index represent the different blocks of text inside a page

    Arguments:
        - pdf_source, bytes or path: a stream of bytes or path representing the pdf file

    Returns:
        - all_content, List[list[dict]]:
            The dict contains:
                - text, str: the text in the given block
                - bbox, tuple(int): x0, y0, x1, y1 -> the bounding boxes of the given text

    """
    all_content = []
    for image in pdf_to_images(pdf_source):
        all_content.append(
            extract_text_from_image(image)
        )

    return all_content
