import copy
import pymupdf
from reportlab.pdfgen import canvas
from reportlab.platypus import Frame, Paragraph, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from arabic_reshaper import ArabicReshaper, reshape
from bidi.algorithm import get_display


class ArabicPDFBuilder:
    """
    Builds PDF documents with absolutely positioned Arabic text blocks.
    Uses Canvas and Frame for precise control over block placement.
    """
    
    def __init__(self, font_path='app/fonts/Amiri-Regular.ttf', font_size=11):
        """
        Initialize the PDF builder with Arabic font configuration
        
        Args:
            font_path: Path to Arabic TTF font file
            font_size: Base font size for text
        """
        self.font_size = font_size
        self.font_name = 'Arabic'
        self.frames = []
        
        # Register Arabic font
        pdfmetrics.registerFont(TTFont(self.font_name, font_path))
        
        # Configure Arabic reshaper (removes harakat/diacritics)
        self.reshaper = ArabicReshaper(configuration={'delete_harakat': True})
        
        # Create Arabic paragraph style
        self.arabic_style = ParagraphStyle(
            'Arabic',
            fontName=self.font_name,
            fontSize=font_size,
            leading=font_size * 1.2,  # Line height (120% of font size)
            alignment=TA_RIGHT,
            wordWrap='RTL',
            textColor='black',
        )
        
    def calculate_font_size_to_fit(self, text, bbox_width, bbox_height, max_font_size=13):
        """Find the largest font size that fits the text in the bbox"""
        min_font = 8
        for font_size in range(max_font_size, min_font, -1):  # Try from large to small
            style = copy.deepcopy(self.arabic_style)
            style.fontSize = font_size
            
            # Test if text fits
            para = Paragraph(text, style)
            w, h = para.wrap(bbox_width , 999999)

            if h <= bbox_height  :
                return font_size  # Found a size that fits!
        
        return min_font  # Minimum fallback
    
    def _mirror_x_coordinate(self, x0, x1, page_width):
        """
        Mirror x-coordinates for RTL (right-to-left) text layout
        
        Args:
            x0: Left edge of bounding box in LTR
            x1: Right edge of bounding box in LTR
            page_width: Total width of the page
            
        Returns:
            tuple: (new_x0, new_x1) - mirrored coordinates
        """
        new_x1 = page_width - x0  # Right edge becomes left edge
        new_x0 = page_width - x1  # Left edge becomes right edge
        return new_x0, new_x1
    
    def _split_arabic_into_lines(self, text, available_width):
        """
        Split Arabic text into list of lines that fit within available width

        Process:
        1. Reshape Arabic text (handle character joining)
        2. Apply bidirectional algorithm (RTL ordering)
        3. Check if it fits in one line
        4. If not, split word-by-word until each line fits
        
        Args:
            text: Original Arabic text
            available_width: Maximum width for each line
            
        Returns:
            list: List of properly shaped and bidirectional text lines
        """
        # Test if entire text fits in one line
        reshaped = reshape(text)
        bidi_text = get_display(reshaped)
        para = Paragraph(bidi_text, self.arabic_style)
        w, h = para.wrap(available_width, 999999)
        
        line_height = self.arabic_style.leading
        num_lines = h / line_height
        
        # If fits in one line, return immediately
        if num_lines <= 1.1:
            return [bidi_text]
        
        # Split into words and build lines that fit
        words = text.split()
        lines = []
        current_words = []
        
        for word in words:
            # Try adding this word to current line
            test_words = current_words + [word]
            test_text = ' '.join(test_words)
            
            # Reshape and test if it fits
            test_reshaped = reshape(test_text)
            test_bidi = get_display(test_reshaped)
            test_para = Paragraph(test_bidi, self.arabic_style)
            w, h = test_para.wrap(available_width, 999999)
            
            if h <= line_height * 1.1:
                # Fits! Add word to current line
                current_words.append(word)
            else:
                # Doesn't fit. Save current line and start new one
                if current_words:
                    line_text = ' '.join(current_words)
                    line_reshaped = reshape(line_text)
                    line_bidi = get_display(line_reshaped)
                    lines.append(line_bidi)
                # Start new line with current word
                current_words = [word]
        
        # Add remaining words as last line
        if current_words:
            line_text = ' '.join(current_words)
            line_reshaped = reshape(line_text)
            line_bidi = get_display(line_reshaped)
            lines.append(line_bidi)
        
        return lines
    
    def optimize(text):
        """
        Tries to optimize by calculating expansion ratio (len(translated text) / len(original text))
        and checking the relation between box_height and actual height needed.
        
        Optimization strategies:
            if expansion ratio > 1 -> translated text is longer: 
                1- Increasing box height
                2- Decreasing font size    
        
            if expansion ratio < 1 -> translated text is shorter:
                1- adjust box heights
                2- increase font size
        """
        pass
    
    def _render_text_block(self, canvas_obj, block, page_width, page_height, prev_frame = None):
        """
        Render a single text block at its specified position
        
        This is where the actual positioning happens:
        1. Extract bounding box and text
        3. Split text into lines
        4. Create paragraphs for each line
        5. Create a Frame at the exact position
        6. Add paragraphs to the frame on the canvas
        
        Args:
            canvas_obj: ReportLab Canvas object to draw on
            block: Dict with 'original_text', "translated_text", and 'bbox' keys
            page_width: Width of the page
            page_height: Height of the page
        """
        # Extract bounding box coordinates and text
        x0, y0, x1, y1 = block['bbox']
        text = block['translated_text'].strip()

        # Calculate dimensions
        box_width = x1 - x0
        box_height = y1 - y0
        
        font_size = self.calculate_font_size_to_fit(text, box_width, box_height)
        self.arabic_style.fontSize = font_size
        
        # Split text into lines that fit the width
        lines = self._split_arabic_into_lines(text, box_width)
        
        # Create paragraph for each line 
        paragraphs = []

        total_height = 0
        para = Paragraph(text, self.arabic_style)
        
        for line in lines:
            para = Paragraph(line, self.arabic_style)
            w, h = para.wrap(box_width, 9999)
            total_height += h
            paragraphs.append(para)

        # get height of all paragraph
        y_position = page_height - y1
        
        # Adjust y_position if there is a previous frame to avoid overlap and very tall gaps
        if prev_frame is not None and prev_frame[1] - (y_position + total_height) > 20:
            y_position = prev_frame[1] - total_height - 20

        # Create a frame for the text block
        frame = Frame(
            x0, y_position,
            box_width, total_height  ,
            leftPadding=0, rightPadding=0,
            topPadding=0, bottomPadding=0,
            showBoundary=0  # Set to 0 to hide red border
        )

        # THIS IS THE KEY LINE: Add paragraphs to frame on canvas
        # This gives us absolute positioning!
        frame.addFromList(paragraphs, canvas_obj)
        return [x0, y_position, box_width, total_height]

    def return_reading_order(self, translated_blocks, page_width, page_height):
        """
        takes translated blocks and returns an object with same data structutre
        but blocks in is in reading order -> from top to bottom, right to left
        right to left because of Arabic
        
        I am using here yolo's bbox where original point is on top left of doc
        """
        def avg_x(column_blocks):
            return sum((b["bbox"][0] + b["bbox"][2]) / 2 for b in column_blocks) / len(column_blocks)

        
        # Mirror x-coordinates for RTL layout
        width_sum = 0
        for block in translated_blocks:
            x0, y0, x1, y1 = block['bbox']
            
            x0, x1 = self._mirror_x_coordinate(x0, x1, page_width)
            block["bbox"] = [x0, y0, x1, y1]
            width_sum += (abs(x0 - x1))
            
            
        translated_blocks.sort(key=lambda b: (b["bbox"][0] + b["bbox"][2]) / 2)
        threshold = (width_sum / len(translated_blocks)) * 0.5

        columns = []
        headings = []
        
        for b in translated_blocks:
            # Skip blocks that are too high on the page (headings) or too wide
            if b["bbox"][3] < page_height * 0.22 and abs(b["bbox"][0] - b["bbox"][2]) > page_width * 0.4:
                headings.append(b)
                continue

            xc = (b["bbox"][0] + b["bbox"][2]) / 2
            if not columns:
                columns.append([b])
            else:
                if abs(xc - avg_x(columns[-1])) < threshold:
                    columns[-1].append(b)
                else:
                    columns.append([b])

        # sort columns by x
        ordered_columns = sorted(columns, key=lambda col: min([b["bbox"][0] for b in col]), reverse=True)
                
        # sort blocks in each column by y
        for i, col in enumerate(ordered_columns):
            ordered_columns_by_y = sorted(col, key=lambda b: b["bbox"][3])
            ordered_columns[i] = ordered_columns_by_y
        
        # sort headings by y
        headings = sorted(headings, key=lambda b: b["bbox"][3])
        
        ordered_blocks = headings + [b for col in ordered_columns for b in col]
        return ordered_blocks


    def build(self, translated_pages, original_pdf_bytes, output='translated.pdf'):
        """
        Build the final PDF with positioned Arabic text blocks
        
        Process for each page:
        1. Get page dimensions from original PDF
        2. Set canvas page size
        3. Render each text block at its specified position
        4. Show page (finish current page)
        5. Repeat for next page
        
        Args:
            translated_pages: List of pages, each containing list of text blocks
                             Each block has 'text' and 'bbox' keys
            original_pdf_bytes: BytesIO stream of the original PDF (for dimensions)
            output: Path / bytes stream for output PDF file
            
        Returns:
            None (writes PDF to output)
        """
        # Open original PDF to get page dimensions
        original_doc = pymupdf.open(stream=original_pdf_bytes, filetype="pdf")
        
        # Create canvas for drawing
        canvas_obj = canvas.Canvas(output)
        
        # Process each page
        for page_index, page_blocks in enumerate(translated_pages):
            # Get page dimensions from original PDF
            page = original_doc[page_index]
            page_width = page.rect.width
            page_height = page.rect.height

            page_blocks = self.return_reading_order(page_blocks, page_width, page_height)

            # Set page size for current page
            canvas_obj.setPageSize((page_width, page_height))
            
            # Render each text block at its position
            # this is the prev frame for the next frame
            prev_frame = self._render_text_block(
                        canvas_obj, page_blocks[0], page_width, page_height)
            
            for block in page_blocks[1:]:
                prev_frame = self._render_text_block(
                            canvas_obj, block, page_width, page_height, prev_frame)
            
            # Finish current page and start new one
            canvas_obj.showPage()
        
        # Save and close the PDF
        canvas_obj.save()
