from pathlib import Path
from typing import Union

import pymupdf

PdfSource = Union[bytes, bytearray, str, Path]


def open_pdf(pdf_source: PdfSource) -> pymupdf.Document:
    """Open a PDF from bytes or a filesystem path; returned Document supports context managers."""
    if isinstance(pdf_source, (bytes, bytearray)):
        return pymupdf.open(stream=pdf_source, filetype="pdf")
    return pymupdf.open(str(pdf_source))
