import json
import re
from functools import lru_cache
from langchain.messages import AIMessage, HumanMessage, SystemMessage
from app.core.prompts import *
from app.core.agents import provider_invoke, provider_stream, _safe_parse_terminology_json, _apply_glossary_matches
from typing import List, Tuple

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
    """
    Generates suggestions for the given translation

    returns 
    {
        Model1: suggestion,
        Model2: suggestion,
        ... 
    }
    
    - Model1, Model2, ... are the names of the models used for generating suggestions.
    - suggestion is a string containing the suggestion for improving the translation.
    
    """
    sys_prompt_content = SUGGESTIONS_SYS_PROMPT
    if style_guide:
        sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
    
    sys_prompt = SystemMessage(
        content = sys_prompt_content,
        agent="suggestions"
    )
    
    page_context = "\n\n".join(page_context)    
    
    user_prompt = HumanMessage(
        content = SUGGESTIONS_PROMPT.format(source_lang=source_lang,
                                            target_lang=target_lang,
                                            page_context=page_context, 
                                            source_text=source_text, 
                                            translation=translation),
                                            
        agent="suggestions"
    )

    prompt = [sys_prompt, user_prompt]

    response1 = provider_invoke("suggestions1", prompt).content
    if not isinstance(response1, str):
        response1 = response1[0]["text"]

    response2 = provider_invoke("suggestions2", prompt).content
    if not isinstance(response2, str):
        response2 = response2[0]["text"]

    response3 = provider_invoke("suggestions3", prompt).content
    
    # deepseek and the other models
    # if not isinstance(response3, str):
    #     response3 = response3[0]["text"]
        
    # GPT5 nano
    if not isinstance(response3, str):
        if len(response3) > 1:
            response3 = response3[1]["text"]
        else:
            response3 = response3[0]["text"]
        # response3 = response3[1]["text"]

    # hardcoded for now, should be more sophisticated
    return {
        "Gemini": response1,
        "Claude": response2,
        "ChatGPT": response3
    }


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


