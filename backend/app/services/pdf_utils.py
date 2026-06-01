from pathlib import Path
from typing import Union

import pymupdf

PdfSource = Union[bytes, bytearray, str, Path]


def open_pdf(pdf_source: PdfSource) -> pymupdf.Document:
    if isinstance(pdf_source, (bytes, bytearray)):
        return pymupdf.open(stream=pdf_source, filetype="pdf")
    return pymupdf.open(str(pdf_source))
