"""
This handles the reading of docx pages and generating them
"""

from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.shared import Pt, Inches, RGBColor
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
    for row_idx, row in enumerate(table.rows):
        for col_idx, cell in enumerate(row.cells):
            tc = cell._tc
            if tc in seen_tc:
                continue
            seen_tc.add(tc)
            yield row_idx, col_idx, cell
            
def extract_run_format(paragraph) -> dict:
    """Grab the dominant run formatting for a paragraph (first non-empty run)."""
    for run in paragraph.runs:
        if run.text.strip():
            color = None
            try:
                if run.font.color and run.font.color.type is not None:
                    color = str(run.font.color.rgb) if run.font.color.rgb else None
            except Exception:
                color = None
            return {
                "font_name": run.font.name,
                "font_size": run.font.size.pt if run.font.size else None,
                "bold": run.font.bold,
                "italic": run.font.italic,
                "underline": run.font.underline,
                "color": color,
            }
    return {}

def apply_run_format(run, fmt: dict):
    if not fmt:
        return
    if fmt.get("font_name"):
        run.font.name = fmt["font_name"]
    if fmt.get("font_size"):
        run.font.size = Pt(fmt["font_size"])
    if fmt.get("bold") is not None:
        run.font.bold = fmt["bold"]
    if fmt.get("italic") is not None:
        run.font.italic = fmt["italic"]
    if fmt.get("underline") is not None:
        run.font.underline = fmt["underline"]
    if fmt.get("color"):
        try:
            run.font.color.rgb = RGBColor.from_string(fmt["color"])
        except Exception:
            pass
            
            
def infer_block_type(paragraph) -> str:
    """Map a source paragraph's Word style to our layout-type vocabulary."""
    style_name = (paragraph.style.name or "").lower()
    if "title" in style_name:
        return "Title"
    if "heading" in style_name:
        return "Section-header"
    if "caption" in style_name:
        return "Caption"
    if "list" in style_name or paragraph._p.pPr is not None and paragraph._p.pPr.numPr is not None:
        return "List-item"
    return "Text"
 
def extract_table_style_info(table) -> dict:
    return {
        "table_style": table.style.name if table.style else None,
        "col_widths": [col.width for col in table.columns] if table.columns else [],
    }
 
 
def add_paragraph_blocks(blocks, paragraph):
    """Split a paragraph's text into sentence-grouped blocks, tagging each
    with the source style name and dominant run formatting so build_docx
    can reproduce it."""
    text = paragraph.text.strip()
    if not text:
        return
    style_name = paragraph.style.name if paragraph.style else "Normal"
    run_fmt = extract_run_format(paragraph)
    btype = infer_block_type(paragraph)
 
    sentences = split_sentences(text)
    # group 3 sentences, instead of single sentences cuz of AI translation
    for i in range(0, len(sentences), 3):
        group = " ".join(sentences[i:i + 3])
        blocks.append({
            "text": group,
            "type": btype,
            "bbox": [],  # No bounding box for DOCX paragraphs
            "info": {
                "style_name": style_name,
                **run_fmt,
            },
        })
        
def add_table_blocks(blocks, table, table_num):
    """Emit one block per unique cell, carrying row/col position, table-level
    style/column-width info, and per-cell run formatting."""
    n_rows = len(table.rows)
    n_cols = len(table.columns)
    style_info = extract_table_style_info(table)
 
    for row_idx, col_idx, cell in iter_unique_cells_table(table):
        text = cell.text.strip()
        if not text:
            continue
        cell_para = cell.paragraphs[0] if cell.paragraphs else None
        cell_fmt = extract_run_format(cell_para) if cell_para else {}
        blocks.append({
            "text": text,
            "type": "Table",
            "bbox": [],
            "info": {
                "num": table_num,
                "rows": n_rows,
                "cols": n_cols,
                "row": row_idx,
                "col": col_idx,
                "table_style": style_info["table_style"],
                "col_widths": style_info["col_widths"],
                **cell_fmt,
            },
        })
        
def get_docx_blocks(docx_bytes: bytes) -> list[list[dict]]:
    doc = Document(docx_bytes)
    blocks = []
    table_num = 0
 
    def walk(container_element):
        nonlocal table_num
        for element in container_element:
            if element.tag.endswith('p'):
                paragraph = Paragraph(element, doc)
                add_paragraph_blocks(blocks, paragraph)
            elif element.tag.endswith('tbl'):
                table = Table(element, doc)
                add_table_blocks(blocks, table, table_num)
                table_num += 1
 
    # HEADER
    if len(doc.sections) > 0 and doc.sections[0].header:
        walk(doc.sections[0].header._element)
 
    # BODY
    walk(doc.element.body)
 
    # FOOTER
    if len(doc.sections) > 0 and doc.sections[0].footer:
        walk(doc.sections[0].footer._element)
 
    return blocks
 
def resolve_style(doc, style_name, fallback=None):
    """Return style_name if it exists in this document's style set,
    otherwise fallback (or None, meaning 'use Word's default')."""
    if not style_name:
        return fallback
    try:
        doc.styles[style_name]
        return style_name
    except KeyError:
        return fallback
    
def add_table(doc, blocks):
    """
    Rebuilds a table from cell-level blocks, each carrying:
      block["info"] = {rows, cols, row, col, table_style, col_widths,
                        font_name, font_size, bold, italic, underline, color}
    """
    if not blocks:
        return
 
    info0 = blocks[0].get("info", {})
    n_rows = info0.get("rows", 0)
    n_cols = info0.get("cols", 0)
 
    table = doc.add_table(rows=n_rows, cols=n_cols)
    table.style =  resolve_style(doc, info0.get("table_style"), "Table Grid")
 
    col_widths = info0.get("col_widths") or []
    for i, width in enumerate(col_widths):
        if width and i < len(table.columns):
            for cell in table.columns[i].cells:
                cell.width = width
 
    for block in blocks:
        info = block.get("info", {})
        row = info.get("row", 0)
        col = info.get("col", 0)
        val = str(block.get("translated_text", ""))
 
        cell = table.cell(row, col)
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run(val)
        apply_run_format(run, info)
        
        
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
            info = block.get("info") or {}
            
            if btype != "Table" and page_table:
                # Flush any accumulated table blocks before processing non-table blocks
                add_table(doc, page_table)
                page_table = []
                        
                        
            if not text:
                continue
            
            style_name = info.get("style_name")
                    


            if btype == "Title":
                doc.add_heading(text, level=0)

            elif btype == "Section-header":
                doc.add_heading(text, level=1)

            elif btype == "Text" or btype is None:
                p = doc.add_paragraph(text, style=resolve_style(doc, style_name))
                if not style_name:
                    pass
                for run in p.runs:
                    apply_run_format(run, info)

            elif btype == "List-item":
                p = doc.add_paragraph(text, style=resolve_style(doc, style_name, "List Bullet"))
                for run in p.runs:
                    apply_run_format(run, info)

            elif btype == "Caption":
                p = doc.add_paragraph(text, style=resolve_style(doc, style_name, "Caption"))
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    apply_run_format(run, info)

            elif btype == "Formula":
                p = doc.add_paragraph(text, style= "Formula")
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
                    
        # Flush any remaining table blocks at the end of the page
        if page_table:
            add_table(doc, page_table)
            page_table = []
         
         
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
