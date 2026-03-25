import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List


def build_xliff(translated_contents: List[List[dict]], source_lang: str, target_lang: str) -> str:
    """
    Converts translated contents to XLIFF 1.2 XML format.
    
    Args:
        translated_contents: List of pages, each containing list of blocks with:
            - original_text: str
            - translated_text: str
            - bbox: list 
        source_lang: Source language code 
        target_lang: Target language code 
    
    Returns:
        XLIFF content as string
    """
    # Create root XLIFF element
    xliff = ET.Element("xliff")
    xliff.set("version", "1.2")
    xliff.set("xmlns", "urn:oasis:names:tc:xliff:document:1.2")
    
    # Create file element
    file_elem = ET.SubElement(xliff, "file")
    file_elem.set("source-language", source_lang)
    file_elem.set("target-language", target_lang)
    file_elem.set("datatype", "plaintext")
    
    # Create body element
    body = ET.SubElement(file_elem, "body")
    
    # Counter for unique trans-unit IDs
    unit_id = 0
    
    # Iterate through pages and blocks
    for page_index, page in enumerate(translated_contents):
        for block_index, block in enumerate(page):
            unit_id += 1
            trans_unit_id = f"page{page_index + 1}-block{block_index + 1}"
            
            # Create trans-unit element
            trans_unit = ET.SubElement(body, "trans-unit")
            trans_unit.set("id", trans_unit_id)
            
            # Create source element
            source = ET.SubElement(trans_unit, "source")
            source.text = block.get("original_text", "")
            
            # Create target element
            target = ET.SubElement(trans_unit, "target")
            target.text = block.get("translated_text", "")
            
            # Add note with location information (optional metadata)
            # note = ET.SubElement(trans_unit, "note")
            # note.text = f"Page {page_index + 1}, Block {block_index + 1}"
    
    # Pretty print XML
    xml_string = minidom.parseString(ET.tostring(xliff)).toprettyxml(indent="  ")
    
    # Remove XML declaration (optional, can keep it)
    # xml_string = "\n".join(xml_string.split("\n")[1:])
    
    return xml_string


def build_xliff_bytes(translated_contents: List[List[dict]], source_lang: str = "en", target_lang: str = "ar") -> bytes:
    """
    Converts translated contents to XLIFF format and returns as bytes.
    """
    xliff_string = build_xliff(translated_contents, source_lang, target_lang)
    return xliff_string.encode("utf-8")
