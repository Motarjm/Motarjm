import pymupdf
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display

FONT_SIZE = 10

# pdfmetrics.registerFont(TTFont('Arabic', 'Amiri-Regular.ttf'))

def build_pdf(translated_pages, original_pdf_path, output_path ="translated.pdf"):
    """
    Builds a new pdf file from 'translated_pages' text ...
    """
    doc = pymupdf.open(original_pdf_path)
    c = canvas.Canvas(output_path)

    for page_index, (page_blocks) in enumerate(translated_pages):
        page = doc[page_index]
        width, height = page.rect.width, page.rect.height
        c.setPageSize((width, height))
        c.setFont("Helvetica", FONT_SIZE)

        for block in page_blocks:
            x0, y0, x1, y1 = block["bbox"]
            text = block["text"]

            rehaped_text = arabic_reshaper.reshape(text)
            bidi_text = get_display(rehaped_text)

            current_y = height - y0 # top of block in ReportLab coordinates

            # Move to bottom-left corner of block
            # c.setFont("Arabic", 10)
            for line in bidi_text.split("\n"):
                print(line)
                c.drawString(x0, current_y , line)
                current_y -= 10

        c.showPage()

    c.save()
    return c
