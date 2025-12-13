from io import BytesIO
import pymupdf
import cv2
from doclayout_yolo import YOLOv10
from huggingface_hub import hf_hub_download
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np

def pdf_to_images(pdf_file: BytesIO):
    """Generator that yields PIL Images one page at a time"""
    with pymupdf.open(pdf_file) as doc:
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
    filepath = hf_hub_download(repo_id="juliozhao/DocLayout-YOLO-DocStructBench",
                               filename="doclayout_yolo_docstructbench_imgsz1024.pt")
    model = YOLOv10(filepath)

    # Perform prediction
    result = model.predict(
        image,
        imgsz=1024,
        conf=0.2,
        device=device
    )

    # Annotate and save the result
    #annotated_frame = result[0].plot(pil=True, line_width=5, font_size=20)
    #cv2.imwrite("result.jpg", annotated_frame)
    
    return result[0].names, result[0].boxes.data


def ocr_predict(image, device="cpu"):
    """
    Arguments:
        - image, numpy.array
        
    Returns the result of paddleOCR
    
    The output is a tuple of:
        - List[str], a list of strings of extracted text, line by line
        - List[List[int]], 4 integers per text, representing (x1 y1 x2 y2)

        """
    ocr = PaddleOCR(
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="PP-OCRv5_mobile_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        device = device)

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
        if yolo_result_names[name_idx] not in ["plain text", "title"]:
            continue

        block_bbox = yolo_result_data[block_num][:4].tolist()

        for i in range(len(ocr_result_texts)):
            # check if small bounding box of the ocr is inside the bigger box of yolo
            if is_bbox_inside(ocr_result_boxes[i], block_bbox):
              block_text += ocr_result_texts[i] + "\n"

        ocr_text.append(
          {
              "text": block_text,
              "bbox": block_bbox
          }
        )

    return ocr_text


def extract_text_from_pdf(pdf_file: BytesIO):
    """
    Takes a pdf file and returns a List[List[dict]], outer index represent the different pages
    the inner index represent the different blocks of text inside a page

    Arguments:
        - pdf_file, BytesIO: a file stored in RAM, can be used by open() function

    Returns:
        - all_content, List[list[dict]]:
            The dict contains:
                - text, str: the text in the given block
                - bbox, tuple(int): x0, y0, x1, y1 -> the bounding boxes of the given text

    """
    all_content = []
    for image in pdf_to_images(pdf_file):
        all_content.append(
            extract_text_from_image(image)
        )

    return all_content



