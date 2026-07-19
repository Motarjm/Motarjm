import json
import re
from functools import lru_cache
from langchain.messages import AIMessage, HumanMessage, SystemMessage
from app.core.prompts import *
from app.core.agents import provider_invoke, provider_stream, _safe_parse_terminology_json, _apply_glossary_matches
from typing import List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

#TODO: terminoloy agent takes as arg 'document' with keys 'text' because the document is coming from the backend
# but in the frontend the document is coming from the frontend with keys 'original_text' and 'translated_text' so we need to unify this
# this is apparent in terminology agent and stream_reviewer functions
def generate_explanation(source_text: str, page_context: List):
    """
    Generates explanation for the given source text
    """
    sys_prompt = SystemMessage(
        content = EXPLANATION_SYS_PROMPT,
        agent="explanator"
    )
    
    page_context = "\n\n".join(page_context)
    
    user_prompt = HumanMessage(
        content = EXPLANATION_PROMPT.format(source_text=source_text, page_context=page_context),
        agent="explanator"
    )
    
    prompt = [sys_prompt, user_prompt]
    
    response = provider_invoke("explanator", prompt).content
    if not isinstance(response, str):
        response = response[0]["text"]
    
    return response

def generate_suggestions(source_text: str, source_lang: str, translation: str, target_lang: str, page_context: List, style_guide: str = ""):
    sys_prompt_content = SUGGESTIONS_SYS_PROMPT
    if style_guide:
        sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
    
    sys_prompt = SystemMessage(content=sys_prompt_content, agent="suggestions")
    page_context = "\n\n".join(page_context)    
    
    user_prompt = HumanMessage(
        content=SUGGESTIONS_PROMPT.format(
            source_lang=source_lang,
            target_lang=target_lang,
            page_context=page_context, 
            source_text=source_text, 
            translation=translation
        ),
        agent="suggestions"
    )
    prompt = [sys_prompt, user_prompt]

    def _fetch(role: str, label: str):
        """Wrapper that calls provider_invoke and normalizes the response."""
        response = provider_invoke(role, prompt).content
        
        if not isinstance(response, str):
            # Keep the special GPT-5 nano handling for suggestions3
            if role == "suggestions3" and len(response) > 1:
                response = response[1]["text"]
            else:
                response = response[0]["text"]
        return label, response

    jobs = [
        ("suggestions1", "Gemini"),
        ("suggestions2", "Claude"),
        ("suggestions3", "ChatGPT"),
    ]

    results = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(_fetch, role, label): label for role, label in jobs}
        for future in as_completed(futures):
            label = futures[future]
            try:
                _, text = future.result()
                results[label] = text
            except Exception as e:
                results[label] = f"Error: {str(e)}"

    return results

# def generate_suggestions(source_text: str, source_lang: str, translation: str, target_lang: str, page_context: List, style_guide: str = ""):
#     """
#     Generates suggestions for the given translation

#     returns 
#     {
#         Model1: suggestion,
#         Model2: suggestion,
#         ... 
#     }
    
#     - Model1, Model2, ... are the names of the models used for generating suggestions.
#     - suggestion is a string containing the suggestion for improving the translation.
    
#     """
#     sys_prompt_content = SUGGESTIONS_SYS_PROMPT
#     if style_guide:
#         sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
    
#     sys_prompt = SystemMessage(
#         content = sys_prompt_content,
#         agent="suggestions"
#     )
    
#     page_context = "\n\n".join(page_context)    
    
#     user_prompt = HumanMessage(
#         content = SUGGESTIONS_PROMPT.format(source_lang=source_lang,
#                                             target_lang=target_lang,
#                                             page_context=page_context, 
#                                             source_text=source_text, 
#                                             translation=translation),
                                            
#         agent="suggestions"
#     )

#     prompt = [sys_prompt, user_prompt]

#     response1 = provider_invoke("suggestions1", prompt).content
#     if not isinstance(response1, str):
#         response1 = response1[0]["text"]

#     response2 = provider_invoke("suggestions2", prompt).content
#     if not isinstance(response2, str):
#         response2 = response2[0]["text"]

#     response3 = provider_invoke("suggestions3", prompt).content
    
#     # deepseek and the other models
#     # if not isinstance(response3, str):
#     #     response3 = response3[0]["text"]
        
#     # GPT5 nano
#     if not isinstance(response3, str):
#         if len(response3) > 1:
#             response3 = response3[1]["text"]
#         else:
#             response3 = response3[0]["text"]
#         # response3 = response3[1]["text"]

#     # hardcoded for now, should be more sophisticated
#     return {
#         "Gemini": response1,
#         "Claude": response2,
#         "ChatGPT": response3
#     }


def generate_backtranslation(target_text: str, source_lang: str, target_lang: str, page_context: List) -> str:
    """
    Generates a back-translation of the given target text.
    Translates from target_lang back to source_lang.
    """
    sys_prompt = SystemMessage(
        content=TRANSLATOR_SYS_PROMPT,
        agent="backtranslation"
    )
    
    page_context = "\n\n".join(page_context)    

    user_prompt = HumanMessage(
        content=BACKTRANSLATION_PROMPT.format(
            source_text=target_text,
            source_lang=target_lang,
            target_lang=source_lang,
            prev_context=page_context,
            terminology = ""
        ),
        agent="backtranslation"
    )

    prompt = [sys_prompt, user_prompt]

    response = provider_invoke("backtranslation", prompt).content
    if not isinstance(response, str):
        response = response[0]["text"]

    return response

def _convert_to_hashable(pages_context: List[List[str]]) -> Tuple:
    """
    Converts list-based doc_context to a hashable tuple format for caching.
    """
    return tuple(tuple(page) for page in pages_context)


@lru_cache(maxsize=1)
def _generate_doc_summary_cached(pages_context_tuple: Tuple) -> str:
    """
    Internal cached function that generates a summary for the given document text.
    Uses tuple format for hashability.
    """
    sys_prompt = SystemMessage(
        content=DOC_SUMMARY_SYS_PROMPT,
        agent="doc_summary"
    )
    
    # Flatten pages_context into a single string with page and block separators
    doc_text = ""
    for i, page in enumerate(pages_context_tuple):
        doc_text += f"--- Page {i+1} ---\n"
        for block in page:
            doc_text += block + "\n\n"
    
    user_prompt = HumanMessage(
        content=DOC_SUMMARY_PROMPT.format(document_text=doc_text),
        agent="doc_summary"
    )
    
    # print(doc_text)

    prompt = [sys_prompt, user_prompt]

    response = provider_invoke("doc_summary", prompt).content
    if not isinstance(response, str):
        response = response[0]["text"]

    return response


def generate_doc_summary(pages_context: List[List[str]]) -> str:
    """
    Generates a summary for the given document text (cached).
    
    The pages_context is a list of pages, where each page is a list of text blocks (strings).
    Results are cached in memory to avoid regenerating the same summary.
    """
    hashable_context = _convert_to_hashable(pages_context)
    return _generate_doc_summary_cached(hashable_context)


def clear_doc_summary_cache():
    """
    Clears the cached document summary. Call this when loading a new document.
    """
    _generate_doc_summary_cached.cache_clear()


def stream_chatbot(source_text: str, translation: str, source_lang: str, target_lang: str, 
                   page_context: List, chat_history: List[dict], model: str, doc_context: List[List[str]], style_guide: str = ""):
    """
    Streams chatbot response tokens for a segment chat.
    
    Arguments:
        - source_text: the source segment text
        - translation: current translation of the segment
        - source_lang / target_lang: language pair
        - page_context: list of page block texts for context
        - chat_history: list of {role: "user"|"bot", text: str}
        - model: "deepseek" | "gemini" | "grok"
    
    Yields:
        - str: text chunks
    """
    provider_key = f"chatbot_{model}"
    
    page_context_str = "\n\n".join(page_context)
    
    
    sys_prompt_content = CHATBOT_SYS_PROMPT
    
    # if there is style guide, dont use doc summary
    if style_guide:
        sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"

    else:
        doc_summary = generate_doc_summary(doc_context)
        sys_prompt_content += f"\n\n{DOC_SUMMARY_ADD_ON.format(doc_summary=doc_summary)}"

    
    sys_prompt = SystemMessage(
        content=sys_prompt_content,
        agent="chatbot"
    )
    
    context_msg = HumanMessage(
        content=CHATBOT_PAGE_CONTEXT_PROMPT.format(
            page_text=page_context_str,
            
        ),
        agent="chatbot"
    )
    
    user_message = HumanMessage(
        content=CHATBOT_PROMPT.format(
            source_text=source_text,
            translation=translation
        ),
        agent="chatbot"
    )
    
    # Build message list: system + context + history
    messages = [sys_prompt, context_msg, user_message]
    
    # Add a placeholder assistant ack so history alternates correctly
    messages.append(AIMessage(content="Understood. I'm ready to help with this segment. What would you like to know?"))
    
    for msg in chat_history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["text"]))
        else:
            messages.append(AIMessage(content=msg["text"]))
    
    for chunk in provider_stream(provider_key, messages):
        content = chunk.content
        if isinstance(content, str):
            yield content
        elif isinstance(content, list) and content:
            yield content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
            

def stream_reviewer(doc_context: List[List[str]], source_lang: str, target_lang: str):
    """
    Streams reviewer response tokens.
    
    
    
    Arguments:
        - source_lang / target_lang: language pair
        - doc_context: list of list of dicts of source and translated blocks for the whole document
    
    Yields:
        - str: text chunks
        
        
    """
    segment_page = 0
    segments = []
    # the difference between doc_source and doc_context is that doc_source is a list of list of strings (only original text),
    # while doc_context is a list of list of dicts with "original_text" and "translated_text" keys. 
    doc_source = []
    for page in doc_context:
        current_page_blocks = []
        for block_num, block in enumerate(page):            
            current_page_blocks.append(block["original_text"])
            segments.append(
                {
                    "id": f'{segment_page}-{block_num}',
                    "source": block["original_text"],
                    "translation": block["translated_text"]
                }
            )
                
            
        doc_source.append(current_page_blocks)
        segment_page += 1
        
    segments = json.dumps(segments, ensure_ascii=False, indent=2)
    
    sys_prompt = REVIEWER_SYS_PROMPT.format(source_lang=source_lang, target_lang=target_lang)
    
    sys_prompt = SystemMessage(
        content=sys_prompt,
        agent="reviewer"
    )
    
    doc_profile = generate_doc_summary(doc_source)
    
    user_message = HumanMessage(
        content=REVIEWER_PROMPT.format(doc_profile=doc_profile, segments=segments),
        agent="reviewer"
        )
        
    
    # Build message list: system + context + history
    messages = [sys_prompt, user_message]
    
    for chunk in provider_stream("reviewer", messages):
        content = chunk.content
        if isinstance(content, str):
            yield content
        elif isinstance(content, list) and content:
            yield content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
            

def terminology_agent(document, source_lang, target_lang, style_guide, glossary):
  """
  Extract key terminology and difficult words from the text
  """
  
  sys_prompt_content = TRANSLATOR_SYS_PROMPT
  if style_guide:
    sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"

  sys_prompt = SystemMessage(
      content=sys_prompt_content,
      agent="TERMINOLOGY"
  )
  
  context = ""
  # if a list then there is multiple pages
  # if a dict then there is only one page
  if isinstance(document[0], list):    
    for i, page in enumerate(document, 1):
        context += f"<page n='{i}'>" + "\n"
        for block in page:
            context += block["text"] + "\n\n"
            
        context += "</page>\n"
        
  else:
      for block in document:
            context += block["text"] + "\n\n"
      
 
  user_prompt = HumanMessage(
      content=TERMINOLOGY_PROMPT.format(
          source_text=context,
          target_lang=target_lang,
          source_lang=source_lang
      ),
      agent="TERMINOLOGY"
  )

  prompt = [sys_prompt, user_prompt]

  response = provider_invoke("terminology", prompt).content
  if not isinstance(response, str):
    response = response[0]["text"]

  parsed_terms = _safe_parse_terminology_json(response)
  if parsed_terms is None:
    return response

  glossary_terms = glossary or {}
  matched_terms = _apply_glossary_matches(parsed_terms, glossary_terms)  
  matched_terms_json = json.dumps(matched_terms, ensure_ascii=False)
  
  return matched_terms_json

def stream_general_chatbot(source_lang: str, target_lang: str, model:str,
                           chat_history: List[dict],  doc_context: List[List[dict]], 
                           style_guide: str = "", review_results: List[dict] = []):
    """
    Streams chatbot response tokens for a general document-level chat.
    
    Arguments:
        - doc_context: list of list of dicts of source and translated blocks for the whole document
        have keys: "original_text" and "translated_text"
        - source_lang / target_lang: language pair
        - chat_history: list of {role: "user"|"bot", text: str}

    
    Yields:
        - str: text chunks
    """
    provider_key = f"general_chatbot_{model}"

    sys_prompt_content = GENERAL_CHATBOT_SYS_PROMPT
    doc_source = []
    for page in doc_context:
        current_page_blocks = []
        for block in page:            
            current_page_blocks.append(block["original_text"])
                
        doc_source.append(current_page_blocks)
    
    # if there is style guide, dont use doc summary
    if style_guide:
        sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"

    else:
        doc_summary = generate_doc_summary(doc_source)
        sys_prompt_content += f"\n\n{DOC_SUMMARY_ADD_ON.format(doc_summary=doc_summary)}"

    
    sys_prompt = SystemMessage(
        content=sys_prompt_content,
        agent="general_chatbot"
    )
    
    context = ""
    # if one page then only differentiate by blocks, if multiple pages then differentiate by pages and blocks
    if len(doc_context) == 1:
        for i, block in enumerate(doc_context[0], 1):
            context += f"<segment id='{i}'>\n"
            context += f"      <source>{block['original_text']}</source>\n"
            context += f"      <translation>{block['translated_text']}</translation>\n"
            context += "</segment>\n"
    
    else:
        for i, page in enumerate(doc_context, 1):
            context += f"<page n='{i}'>" + "\n"
            for j, block in enumerate(page, 1):
                context += f"    <segment id='{j}'>\n"
                context += f"      <source>{block['original_text']}</source>\n"
                context += f"      <translation>{block['translated_text']}</translation>\n"
                context += "    </segment>\n"
            context += "</page>\n"
    
    context_msg = HumanMessage(
        content=GENERAL_CHATBOT_PROMPT.format(
            doc_context=context
        ),
        agent="general_chatbot"
    )
    
    # Build message list: system + context + history
    messages = [sys_prompt, context_msg]
    
    if review_results:
        changed = [r for r in review_results if r.get("changed")]
        review_xml = "<review_results>\n"
        for r in review_results:
            review_xml += f'  <segment id="{r["id"]}" changed="{str(r.get("changed", False)).lower()}">\n'
            review_xml += f'    <source>{r["source"]}</source>\n'
            review_xml += f'    <original_translation>{r["original_translation"]}</original_translation>\n'
            review_xml += f'    <revised_translation>{r["revised_translation"]}</revised_translation>\n'
            if r.get("note"):
                review_xml += f'    <note>{r["note"]}</note>\n'
            review_xml += '  </segment>\n'
        review_xml += "</review_results>"
        messages.append(HumanMessage(
            content=f"Here are the review results for this document ({len(changed)} segments changed):\n\n{review_xml}",
            agent="general_chatbot"
        ))
        messages.append(AIMessage(content="I have the review results. I'm ready to explain the changes and discuss them with you."))
    
    for msg in chat_history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["text"]))
        else:
            messages.append(AIMessage(content=msg["text"]))
    
    for chunk in provider_stream(provider_key, messages):
        # if chunk.get("model"):
        #     messages = chunk["model"]["messages"]
        #   # Find the last AI message without tool calls
        # for msg in reversed(messages):
        #     if isinstance(msg, AIMessage) and not msg.tool_calls:
        #         message = msg.content
        #         yield message[0].get("text", "") if isinstance(message[0], dict) else str(message[0])
        content = chunk.content
        if isinstance(content, str):
            yield content
        elif isinstance(content, list) and content:
            yield content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
    
