import PyPDF2

def extract_pdf_text(pdf_reader):
    content = ""
    for page in pdf_reader.pages:
        content += page.extract_text()

    print(content)


