from io import BytesIO
import requests
from app.config.config import *
from app.core.prompts import *
# from app.services.extract_text import *
from app.core.graph_models import *
from app.core.workflow import graph
from app.services.build_pdf import *


def translate_list_of_texts(texts: list[str], source_lang: str, target_lang: str) -> list[str]:
    translated_texts = []
    prev_text = ""
    for i, text in enumerate(texts):    
        translated_text = translate_text(text, prev_text, source_lang, target_lang)
        translated_texts.append(translated_text)
        prev_text = text  # update prev_text for the next iteration
        
    return translated_texts

def translate_text(text: str, prev_text: str, source_lang: str, target_lang: str) -> str:

    state = State(
        source_text=text,
        source_lang=source_lang,
        target_lang=target_lang,
        max_iterations=1,
        prev_context=prev_text)

    try:
        response = graph.invoke(state)

    except requests.exceptions.RequestException as e:
        raise Exception(f"Network or HTTP error during translation: {e}")
    except ValueError:
        raise Exception("Failed to parse API response as JSON")

    # for msg in response["messages"]:
    #     msg.pretty_print()
    
    # return the translation with the highest evaluator score
    #translations_with_evaluations = []
    #for msg in response["messages"]:
    #    if (msg.agent == "TRANSLATOR" or msg.agent == "EVALUATOR") and isinstance(msg, AIMessage):
    #      translations_with_evaluations.append(msg.content)
          
    # I am taking for granted that the output of evaluator is a JSON
    #for i in range(len(translations_with_evaluations)):
    #    pass
        

    translated = response["current_translation"]
    #if not translated:
    #    print(text)
    #    raise Exception("Translation failed or no text returned from API")

    return translated

def translate_file_content_txt(file_content: str, source_lang: str, target_lang: str) -> str:
    return translate_text(file_content, source_lang, target_lang)

def translate_file_content_pdf(pdf_bytes: bytes, source_lang: str, target_lang:str) -> list[list[dict]]:
    """
    translates file content

    Args:
         - pdf_bytes, bytes: a stream of bytes representing the pdf file
         - source_lang, str: source language to translate from
         - target_lang, str: target language to translate into

    Returns:
        translated_content, List[list[dict]]: outer index represent the different pages
            the inner index represent the different blocks of text inside a page
            The dict contains:
                - original_text, str: the text in the given block,
                - bbox, tuple(int): x0, y0, x1, y1 -> the bounding boxes of the given text
    """
    
    content = [[{'text': "In a quiet village tucked between two silver-blue mountains lived an old clockmaker\nnamed Yarek. His shop was small—barely more than a room with dusty windows and\nwooden shelves—but inside it, time itself seemed to rest. Clocks of every kind ticked and\nchimed: brass pocket watches, tall pendulum clocks, tiny cuckoos perched in their carved\nhouses. Yet Yarek's most cherished project was an unfinished clock lying open on his work-\nbench, its gears glinting like tiny suns.\n",
  'bbox': [71.0361557006836,
   212.41978454589844,
   541.9181518554688,
   314.9400939941406]},
 {'text': 'Every morning, a girl named Lina passed by on her way to school. She would stop at the\ndoor, press her face to the glass, and watch Yarek work with his steady hands. One foggy\nmorning, Yarek waved her inside.\n',
  'bbox': [70.59217834472656,
   334.8522644042969,
   542.0496826171875,
   383.2663269042969]},
 {'text': "For weeks, Lina visited the shop. She learned to oil tiny screws, polish brass, and set\nsprings just right. Slowly, the old clockmaker's hands grew steadier when hers were beside\nthem. One afternoon as winter crept closer. Yarek placed the Promise Clock in front of her.\n",
  'bbox': [70.64075469970703,
   611.88818359375,
   542.07080078125,
   662.1046142578125]},
 {'text': 'Lina nodded. "Everyone says you can fix any clock—but that one," she said, pointing to\nthe brass clock on his bench, "never moves."\n',
  'bbox': [71.4128189086914,
   439.0286865234375,
   541.7099609375,
   470.2324523925781]},
 {'text': 'Yarek smiled softly. "That one is special. It\'s the Promise Clock. I\'ve been building it\nfor someone who hasn\'t arrived yet."\n',
  'bbox': [71.08402252197266,
   490.76544189453125,
   541.5205688476562,
   522.9660034179688]},
 {'text': 'Who?"she asked.\n',
  'bbox': [89.61293029785156,
   542.5999145507812,
   188.73709106445312,
   557.3048706054688]},
 {'text': '"I don\'t know." Yarek said. "But I\'ll know when they come."\n',
  'bbox': [89.64185333251953,
   576.43896484375,
   405.8104248046875,
   591.8262939453125]},
 {'text': "The Clockmaker's Promise\n",
  'bbox': [194.03944396972656,
   119.21239471435547,
   418.2802429199219,
   140.8619384765625]},
 {'text': '"Curious about time, are you?”he asked.\n',
  'bbox': [89.80379486083984,
   403.6716003417969,
   304.6008605957031,
   418.7094421386719]},
 {'text': '"It\'s yours,” he said.\n',
  'bbox': [89.6241455078125,
   680.7218017578125,
   196.09584045410156,
   695.9491577148438]}
 ]]
    # return content
    
    # content = extract_text_from_pdf(pdf_bytes)
    
    # the following two lines are only here to return reading order of the pdf
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    builder = ArabicPDFBuilder()
    
    # order the translated content according to reading order
    ordered_content = []
    for page_index, page_blocks in enumerate(content):
        # Get page dimensions from original PDF
        page = doc[page_index]
        page_width = page.rect.width
        page_height = page.rect.height
        
        ordered_blocks = builder.return_reading_order(page_blocks, page_width, page_height)

        ordered_content.append(ordered_blocks)

    translated_content = []
    for page in ordered_content:
        translated_blocks = []
        prev_text = ""
        for i in range(len(page)):
            block = page[i]
                
            print("\n\n---------------------------------\n\n")
            print(f"Translation: {i}")
            translated_text = translate_text(block["text"],
                                             prev_text,
                                             source_lang,
                                             target_lang)
            print(translated_text)
            translated_blocks.append({
                "original_text":block["text"],
                "translated_text":translated_text,
                "bbox":block["bbox"]
            })
            prev_text = page[i-1]["text"]  # update prev_text for the next iteration

        translated_content.append(translated_blocks)
        
    return translated_content


# translate_file_content_pdf("story.pdf", "English", "Egyptian Arabic")
