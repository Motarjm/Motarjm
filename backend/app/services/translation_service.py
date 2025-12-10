import requests
from app.config.config import *
from app.helpers.prompts import *
from app.services.pdf_builder import *

def translate_text(text: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    sys_prompt = SYSTEM_PROMPT.format(source_lang = source_lang, target_lang = target_lang)
    trans_prompt = (TRANSLATE_PROMPT
                    .format(source_lang=source_lang,
                                           target_lang=target_lang,
                                           source_text=text))
    messages = [
        {
            "role":"system",
            "content":sys_prompt
        },
        {
            "role":"user",
            "content":trans_prompt
        }
    ]
    try:
        completion = model.chat.completions.create(
            messages= messages,
            temperature=TEMPERATURE
        )

    except requests.exceptions.RequestException as e:
        raise Exception(f"Network or HTTP error during translation: {e}")
    except ValueError:
        raise Exception("Failed to parse API response as JSON")

    translated = completion.choices[0].message.content
    if not translated:
        raise Exception("Translation failed or no text returned from API")

    return translated

def translate_file_content_txt(file_content: str, source_lang: str = "en", target_lang: str = "ar") -> str:
    return translate_text(file_content, source_lang, target_lang)

def translate_file_content_pdf(file_content: list[list[dict]], pdf_file:str ,source_lang: str = "en", target_lang: str = "ar") -> str:
    """
    translates file content

    Args:
         - file_content, List[List[dict]]: A list of pages, where each page contains a list of blocks, and each block includes a text string and its coordinates.
         - source_lang, str: source language to translate from
         - target_lang, str: target language to translate into

    Returns:

    """
    translated = []
    for page in file_content:
        translated_blocks = []
        for block in page:
            translated_text = translate_text(block["text"], "en", "ar")
            translated_blocks.append({
                "text":translated_text,
                "bbox":block["bbox"]
            })

        translated.append(translated_blocks)

    output_buffer = build_pdf(translated, pdf_file)
    return output_buffer

# file_content = [[{'text': 'الوعد الصادق\n', 'bbox': (195.01300048828125, 121.12477111816406, 417.0108947753906, 141.7872772216797)}, {'text': 'In a quiet village tucked between two silver-blue mountains lived an old clockmaker\nnamed Yarek.\nHis shop was small—barely more than a room with dusty windows and\nwooden shelves—but inside it, time itself seemed to rest. Clocks of every kind ticked and\nchimed: brass pocket watches, tall pendulum clocks, tiny cuckoos perched in their carved\nhouses. Yet Yarek’s most cherished project was an unfinished clock lying open on his work-\nbench, its gears glinting like tiny suns.\n', 'bbox': (72.0, 214.8356475830078, 540.0460205078125, 313.4648742675781)}, {'text': 'Every morning, a girl named Lina passed by on her way to school. She would stop at the\ndoor, press her face to the glass, and watch Yarek work with his steady hands. One foggy\nmorning, Yarek waved her inside.\n', 'bbox': (72.0, 336.1796569824219, 540.0670166015625, 382.8048400878906)}, {'text': '“Curious about time, are you?” he asked.\n', 'bbox': (89.55899810791016, 405.5196228027344, 303.6766662597656, 417.4748229980469)}, {'text': 'Lina nodded. “Everyone says you can fix any clock—but that one,” she said, pointing to\nthe brass clock on his bench, “never moves.”\n', 'bbox': (72.0, 440.1896057128906, 540.0787353515625, 469.47979736328125)}, {'text': 'Yarek smiled softly. “That one is special. It’s the Promise Clock. I’ve been building it\nfor someone who hasn’t arrived yet.”\n', 'bbox': (72.0, 492.1946105957031, 540.0188598632812, 521.4847412109375)}, {'text': '“Who?” she asked.\n', 'bbox': (89.55899810791016, 544.1986083984375, 187.89053344726562, 556.15380859375)}, {'text': '“I don’t know,” Yarek said. “But I’ll know when they come.”\n', 'bbox': (89.55899810791016, 578.8685913085938, 405.546875, 590.8237915039062)}, {'text': 'For weeks, Lina visited the shop. She learned to oil tiny screws, polish brass, and set\nsprings just right. Slowly, the old clockmaker’s hands grew steadier when hers were beside\nthem. One afternoon as winter crept closer, Yarek placed the Promise Clock in front of her.\n', 'bbox': (72.0, 613.53857421875, 540.0340576171875, 660.1637573242188)}, {'text': '“It’s yours,” he said.\n', 'bbox': (89.55899810791016, 682.8785400390625, 195.44619750976562, 694.833740234375)}, {'text': '1\n', 'bbox': (303.0740051269531, 740.5445556640625, 308.93206787109375, 752.499755859375)}], [{'text': 'Lina blinked. “But I didn’t order it.”\n', 'bbox': (89.55899810791016, 74.61164855957031, 281.0932922363281, 86.56684875488281)}, {'text': '“I told you,” Yarek said, “I was waiting for the right person. Someone who listens to the\nquiet things.”\n', 'bbox': (72.0, 109.28163146972656, 540.0668334960938, 138.5718536376953)}, {'text': 'She wound the clock with trembling fingers. For the first time, the gears stirred. A small,\nclear tick filled the room—the beginning of something steady and true.\n', 'bbox': (72.0, 161.28663635253906, 540.0308837890625, 190.5768585205078)}, {'text': 'Yarek placed a hand over hers. “Time is precious,” he said. “But it’s even more precious\nwhen shared.”\n', 'bbox': (72.0, 213.29164123535156, 540.0308837890625, 242.5818634033203)}, {'text': 'And from that day on, the clockmaker and the girl built not just clocks, but the gentle\nrhythm of a friendship that echoed long after the mountains swallowed the sun.\n', 'bbox': (72.0, 265.2966613769531, 540.0548706054688, 294.58685302734375)}, {'text': '2\n', 'bbox': (303.0740051269531, 740.5446166992188, 308.93206787109375, 752.4998168945312)}]]
#
# print(translate_file_content_pdf(file_content))