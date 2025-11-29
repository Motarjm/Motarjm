import pymupdf

def extract_pdf_blocks(path):
    """
    Takes a pdf file and returns a List[List[dict]], outer index represent the different pages
    the inner index represent the different blocks inside a page

    The dict contains:
        - text, str: the text in the given block
        - bbox, tuple(int): x0, y0, x1, y1 -> the bounding boxes of the given text

    Args:
          - path, str: pdf file

    Returns:
        page_contents, List[list[dict]]
    """
    doc = pymupdf.open(path)
    pages_data = []

    for page_index, page in enumerate(doc):
        blocks = page.get_text("blocks")  # list of blocks: (x0,y0,x1,y1,text,block_no,...)
        structured_blocks = []

        for b in blocks:
            x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]

            # ignore blocks with no text
            if text.strip():
                structured_blocks.append({
                    "text": text,
                    "bbox": (x0, y0, x1, y1)
                })

        pages_data.append(structured_blocks)

    return pages_data