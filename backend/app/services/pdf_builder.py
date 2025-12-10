import pymupdf
import os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from io import BytesIO
import textwrap
import arabic_reshaper
from bidi.algorithm import get_display

FONT_SIZE = 12
LINE_HEIGHT = 14
FONT_FILE = os.path.join(os.path.dirname(__file__), "fonts/Amiri-Regular.ttf")
pdfmetrics.registerFont(TTFont("Arabic", FONT_FILE))

def build_pdf(translated_pages, original_pdf_path):
    doc = pymupdf.open(original_pdf_path)

    buffer = BytesIO()
    c = canvas.Canvas(buffer)

    for page_index, page_blocks in enumerate(translated_pages):

        page = doc[page_index]
        width, height = page.rect.width, page.rect.height

        c.setPageSize((width, height))
        c.setFont("Arabic", FONT_SIZE)

        for block in page_blocks:
            x0, y0, x1, y1 = block["bbox"]
            text = block["text"]

            # Fix Arabic
            reshaped = arabic_reshaper.reshape(text)
            bidi_text = get_display(reshaped)

            block_w = x1 - x0
            block_h = y1 - y0

            # Fix Y-axis (OCR → PDF)
            bottom_pdf_y = height - y1

            # Soft-wrap text to fit block width
            max_chars = int(block_w / (FONT_SIZE * 0.6))
            lines = textwrap.wrap(bidi_text, width=max_chars)

            # Start drawing from top INSIDE the block
            current_y = bottom_pdf_y + block_h - LINE_HEIGHT

            for line in lines:
                if current_y < bottom_pdf_y:
                    break  # stop if below block
                c.drawRightString(x1, current_y, line)
                current_y -= LINE_HEIGHT

        c.showPage()

    c.save()
    buffer.seek(0)
    return buffer
