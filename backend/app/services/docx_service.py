"""
This handles the reading of docx pages and generating them
"""

from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import re
from io import BytesIO
    

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


def add_table(doc, blocks):
    """
    Assumes block for a Table has a nested structure, e.g.:
    block["cells"] = [["r1c1", "r1c2"], ["r2c1", "r2c2"]]
    Adjust to match however your table blocks are actually structured —
    a bbox+text blob alone isn't enough to reconstruct rows/columns.
    """
    n_rows = blocks[0].get("info", {}).get("rows", 0)
    n_cols = blocks[0].get("info", {}).get("cols", 0)
    
    table = doc.add_table(rows=n_rows, cols=n_cols)
    print(blocks)
    table.style = "Table Grid"
    for block in blocks:
        row = block.get("info", {}).get("row", 0)
        col = block.get("info", {}).get("col", 0)
        val = block.get("translated_text", "")
        table.cell(row, col).text = str(val)

def build_docx(pages):
    """
    pages: list (per page) of list (per block) of dicts like
           {"type": "Text", "text": "...", "bbox": [x0, y0, x1, y1], ...}
    """
    doc = Document()

    # --- Set up custom styles once ---
    styles = doc.styles
    
    def set_style_rtl(style):
        pPr = style.element.get_or_add_pPr()
        bidi = OxmlElement('w:bidi')
        bidi.set(qn('w:val'), '1')
        pPr.append(bidi)

    set_style_rtl(doc.styles['Normal'])
    footer_flag = False
    print(pages)
    for page_idx, blocks in enumerate(pages):
        footnotes_buffer = []
        page_table = []

        for block_num, block in enumerate(blocks):
            btype = block.get("type")
            
            
            text = block.get("translated_text", "").strip()
            text = text.replace("\n", " ").strip()  # Normalize newlines to spaces
            
            if btype != "Table" and page_table:
                # Flush any accumulated table blocks before processing non-table blocks
                add_table(doc, page_table)
                page_table = []
                        
                        
            if not text:
                continue

            if btype == "Title":
                doc.add_heading(text, level=0)

            elif btype == "Section-header":
                doc.add_heading(text, level=1)

            elif btype == "Text" or btype is None:
                doc.add_paragraph(text)

            elif btype == "List-item":
                doc.add_paragraph(text, style="List Bullet")

            elif btype == "Caption":
                p = doc.add_paragraph(text, style="Caption")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            elif btype == "Formula":
                p = doc.add_paragraph(text, style="Formula")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    run.font.name = "Cambria Math"

            elif btype == "Footnote":
                # Defer — collect and dump at bottom of the page's content
                footnotes_buffer.append(text)

            elif btype == "Page-footer":
                footer_flag = True
                footer = text
                
                
            elif btype == "Table":
                # if first table or another part of the same table
                if block.get("info", {}).get("num") == 0 \
                    or (block_num > 0 and
                        block.get("info", {}).get("num") == blocks[block_num - 1].get("info", {}).get("num")):
                    page_table.append(block)
                
                # new table
                else:
                    add_table(doc, page_table)
                    page_table = []
                    page_table.append(block)
         
        # Flush footnotes for this page as a small block at the end
        if footnotes_buffer:
            sep = doc.add_paragraph()
            sep.paragraph_format.space_before = Pt(12)
            for fn in footnotes_buffer:
                doc.add_paragraph(fn, style="Footnote")
                
        if page_idx < len(pages) - 1:
            doc.add_page_break()

    if footer_flag:
        doc.sections[0].footer.paragraphs[0].text = footer
        
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()
