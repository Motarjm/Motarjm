import asyncio
import json
import re
from functools import lru_cache
from typing import Any, Dict, Optional, Union
from langchain.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from app.core.prompts import *
from app.core.agents import provider_invoke, provider_ainvoke, provider_stream, _safe_parse_terminology_json, _apply_glossary_matches
from typing import List, Tuple
from typing import List
from app.core.llms import MAX_TOOL_CALLS
from lmnr import observe


#TODO: terminoloy agent takes as arg 'document' with keys 'text' because the document is coming from the backend
# but in the frontend the document is coming from the frontend with keys 'original_text' and 'translated_text' so we need to unify this
# this is apparent in terminology agent and stream_reviewer functions
@observe(name="generate_explanation")
async def generate_explanation(source_text: str, page_context: List):
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
    
    response = (await provider_ainvoke("explanator", prompt)).content
    if not isinstance(response, str):
        response = response[0]["text"]
    
    return response

@observe(name="generate_suggestions")
async def generate_suggestions(source_text: str, source_lang: str, translation: str, target_lang: str, page_context: List, style_guide: str = ""):
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

    async def _fetch(role: str, label: str):
        """Wrapper that calls provider_ainvoke and normalizes the response."""
        response = (await provider_ainvoke(role, prompt)).content
        
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

    async def _fetch_safe(role: str, label: str):
        try:
            _, text = await _fetch(role, label)
            return label, text
        except Exception as e:
            return label, f"Error: {str(e)}"

    results = {}
    for label, text in await asyncio.gather(*[_fetch_safe(role, label) for role, label in jobs]):
        results[label] = text

    return results

@observe(name="generate_backtranslation")
async def generate_backtranslation(target_text: str, source_lang: str, target_lang: str, page_context: List) -> str:
    """
    Generates a back-translation of the given target text.
    Translates from target_lang back to source_lang.
    """
    sys_prompt = SystemMessage(
        content=TRANSLATOR_SYS_PROMPT.format(user_role=DEFAULT_TRANSLATOR_ROLE),
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

    response = (await provider_ainvoke("backtranslation", prompt)).content
    if not isinstance(response, str):
        response = response[0]["text"]

    return response

def _convert_to_hashable(pages_context: List[List[str]]) -> Tuple:
    """
    Converts list-based doc_context to a hashable tuple format for caching.
    """
    return tuple(tuple(page) for page in pages_context)


@lru_cache(maxsize=1)
@observe(name="generate_doc_summary")
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
                   page_context: List, chat_history: List[dict], model: str, doc_context: List[List[str]], style_guide: str = "",
                   user_role: str = "", user_preferences: Optional[List[str]] = None):
    """
    Streams chatbot response tokens for a segment chat.
    
    Arguments:
        - source_text: the source segment text
        - translation: current translation of the segment
        - source_lang / target_lang: language pair
        - page_context: list of page block texts for context
        - chat_history: list of {role: "user"|"bot", text: str}
        - model: "deepseek" | "gemini" | "grok"
        - user_role / user_preferences: optional translator profile to adopt
    
    Yields:
        - str: text chunks
    """
    provider_key = f"chatbot_{model}"
    
    page_context_str = "\n\n".join(page_context)
    
    
    sys_prompt_content = CHATBOT_SYS_PROMPT.format(
        source_lang=source_lang,
        target_lang=target_lang,
        MAX_TOOL_CALLS=MAX_TOOL_CALLS
    )
    
    # if there is style guide, dont use doc summary
    if style_guide:
        sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"

    else:
        doc_summary = generate_doc_summary(doc_context)
        sys_prompt_content += f"\n\n{DOC_SUMMARY_ADD_ON.format(doc_summary=doc_summary)}"

    if user_role or user_preferences:
        user_preferences = "\n".join(f"- {p}" for p in user_preferences if p and p.strip()) if user_preferences else ""
        sys_prompt_content += f"\n\n{USER_PROFILE_ADD_ON.format(user_role=user_role or DEFAULT_TRANSLATOR_ROLE, user_preferences=user_preferences)}"

    
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
        elif msg["role"] == "tool":
            # Same reconstruction as the general chatbot: replay the tool call
            # and its result as real messages, never shown to the user.
            tool_call_id = msg.get("tool_call_id")
            tool_name = msg.get("name", "exa_search")
            messages.append(AIMessage(
                content="",
                tool_calls=[{
                    "name": tool_name,
                    "args": msg.get("args") or {},
                    "id": tool_call_id,
                }],
            ))
            messages.append(ToolMessage(
                content=msg.get("content", ""),
                tool_call_id=tool_call_id,
                name=tool_name,
            ))
        else:
            messages.append(AIMessage(content=msg["text"]))

    for event in provider_stream(provider_key, messages, stream_mode=["updates", "messages"]):
        mode, payload = event

        if mode == "updates":
            # ── Tool node just ran: a search finished, surface the results ──
            if payload.get("tools"):
                tool_messages = payload["tools"].get("messages", [])
                for tm in tool_messages:
                    if getattr(tm, "name", None) != "exa_search":
                        continue
                    urls = []
                    query = ""
                    try:
                        result_payload = json.loads(tm.content)
                        query = result_payload.get("query", "")
                        urls = [
                            {"title": r.get("title"), "url": r.get("url")}
                            for r in result_payload.get("results", [])
                            if r.get("url")
                        ]
                    except (json.JSONDecodeError, TypeError, AttributeError):
                        pass

                    yield {
                        "type": "tool_call",
                        "tool": "exa_search",
                        "query": query,
                        "urls": urls,
                        "content": tm.content,
                        "id": getattr(tm, "tool_call_id", None),
                    }
                continue

            # ── Model node just decided to call a tool: announce it early ──
            if payload.get("model"):
                model_messages = payload["model"].get("messages", [])
                for msg in reversed(model_messages):
                    if isinstance(msg, AIMessage) and msg.tool_calls:
                        for tc in msg.tool_calls:
                            if tc.get("name") == "exa_search":
                                yield {
                                    "type": "tool_start",
                                    "tool": "exa_search",
                                    "query": (tc.get("args") or {}).get("query", ""),
                                    "id": tc.get("id"),
                                }
                        break
            continue
            
        elif mode == "messages":
            message_chunk, metadata = payload
            if metadata.get("langgraph_node") != "model":
                continue

            content = getattr(message_chunk, "content", "")
            if isinstance(content, str):
                if content:
                    yield content
            elif isinstance(content, list) and content:
                text = content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
                if text:
                    yield text


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
            

@observe(name="terminology_agent")
async def terminology_agent(document, source_lang, target_lang, style_guide, glossary):
  """
  Extract key terminology and difficult words from the text
  """
  
  sys_prompt_content = TRANSLATOR_SYS_PROMPT.format(user_role=DEFAULT_TRANSLATOR_ROLE)
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

  response = (await provider_ainvoke("terminology", prompt)).content
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
                           style_guide: str = "", review_results: List[dict] = [],
                           glossary: dict = None,
                           user_role: str = "", user_preferences: Optional[List[str]] = None):
    """
    Streams chatbot response tokens for a general document-level chat.
    
    Arguments:
        - doc_context: list of list of dicts of source and translated blocks for the whole document
        have keys: "original_text" and "translated_text"
        - source_lang / target_lang: language pair
        - chat_history: list of {role: "user"|"bot", text: str}
        - user_role / user_preferences: optional translator profile to adopt

    
    Yields:
        - str: text chunks
    """
    provider_key = f"general_chatbot_{model}"

    sys_prompt_content = GENERAL_CHATBOT_SYS_PROMPT.format(
        source_lang=source_lang,
        target_lang=target_lang,
        MAX_TOOL_CALLS=MAX_TOOL_CALLS
    )
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

    if user_role or user_preferences:
        user_preferences = "\n".join(f"- {p}" for p in user_preferences if p and p.strip()) if user_preferences else ""
        sys_prompt_content += f"\n\n{USER_PROFILE_ADD_ON.format(user_role=user_role or DEFAULT_TRANSLATOR_ROLE, user_preferences=(user_preferences))}"

    
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
        elif msg["role"] == "tool":
            # A prior search from an earlier turn. Reconstruct it as the model
            # will expect: the AIMessage that requested the tool call, then
            # the ToolMessage carrying its result — never shown to the user,
            # but present so the model has real continuity of what it already
            # searched for and found.
            tool_call_id = msg.get("tool_call_id")
            tool_name = msg.get("name", "exa_search")
            messages.append(AIMessage(
                content="",
                tool_calls=[{
                    "name": tool_name,
                    "args": msg.get("args") or {},
                    "id": tool_call_id,
                }],
            ))
            messages.append(ToolMessage(
                content=msg.get("content", ""),
                tool_call_id=tool_call_id,
                name=tool_name,
            ))
        else:
            messages.append(AIMessage(content=msg["text"]))

    # extract_terminology is bound statically on the agent (see llms.py) and
    # reads its data via `runtime: ToolRuntime` -> `runtime.context`, so all
    # we need to do here is hand this turn's data through as `context=`.
    # It never becomes a tool argument the model has to fill in.
    terminology_context = {
        "translated_contents": doc_context,
        "source_lang": source_lang,
        "target_lang": target_lang,
        "style_guide": style_guide,
        "glossary": glossary,
    }

    for event in provider_stream(provider_key, messages, stream_mode=["updates", "messages"],
                                  context=terminology_context):
        mode, payload = event

        if mode == "updates":
            # ── Tool node just ran: a search finished, surface the results ──
            if payload.get("tools"):
                tool_messages = payload["tools"].get("messages", [])
                for tm in tool_messages:
                    tool_name = getattr(tm, "name", None)

                    if tool_name == "extract_terminology":
                        # Result is the short JSON string the tool returned
                        # (status/file_id/term_count) — never binary content.
                        try:
                            result_payload = json.loads(tm.content)
                        except (json.JSONDecodeError, TypeError, AttributeError):
                            result_payload = {}
                        yield {
                            "type": "file_ready",
                            "tool": "extract_terminology",
                            "file_id": result_payload.get("file_id"),
                            "terms": result_payload.get("terms"),
                            "content": tm.content,
                            "id": getattr(tm, "tool_call_id", None),
                        }
                        continue

                    if tool_name != "exa_search":
                        continue
                    urls = []
                    query = ""
                    try:
                        result_payload = json.loads(tm.content)
                        query = result_payload.get("query", "")
                        urls = [
                            {"title": r.get("title"), "url": r.get("url")}
                            for r in result_payload.get("results", [])
                            if r.get("url")
                        ]
                    except (json.JSONDecodeError, TypeError, AttributeError):
                        pass

                    yield {
                        "type": "tool_call",
                        "tool": "exa_search",
                        "query": query,
                        "urls": urls,               # UI-only: title/url for the link chip
                        "content": tm.content,       # full tool output, for chat_history/model continuity
                        "id": getattr(tm, "tool_call_id", None),
                    }
                continue

            # ── Model node just decided to call a tool: announce it early ──
            if payload.get("model"):
                model_messages = payload["model"].get("messages", [])
                for msg in reversed(model_messages):
                    if isinstance(msg, AIMessage) and msg.tool_calls:
                        for tc in msg.tool_calls:
                            if tc.get("name") == "exa_search":
                                yield {
                                    "type": "tool_start",
                                    "tool": "exa_search",
                                    "query": (tc.get("args") or {}).get("query", ""),
                                    "id": tc.get("id"),
                                }
                            elif tc.get("name") == "extract_terminology":
                                yield {
                                    "type": "tool_start",
                                    "tool": "extract_terminology",
                                    "id": tc.get("id"),
                                }
                        break
            # Note: actual answer text is NOT taken from "updates" — that only
            # fires once the model node's whole invoke() has finished, which
            # is why text used to appear all at once. Real tokens come from
            # the "messages" stream below instead.
            continue

        elif mode == "messages":
            message_chunk, metadata = payload
            # Only stream tokens generated by the model node itself (not the
            # tool node's ToolMessage, which isn't a token-by-token chunk).
            if metadata.get("langgraph_node") != "model":
                continue

            content = getattr(message_chunk, "content", "")
            if isinstance(content, str):
                if content:
                    yield content
            elif isinstance(content, list) and content:
                text = content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
                if text:
                    yield text
                    
    
@observe(name="extract_translator_profile")
def extract_translator_profile(text: str) -> dict[str, Union[str, List]]:
    """
    Extracts translator profile a given SKILL.md or text file content.
    Returns a dictionary with keys: 
        "role": str
        "preferences": List[str].
    """
    prompt = SystemMessage(
        content=TRANSLATOR_PROFILE_PROMPT.format(
                    input_text=text
                ),
        agent="translator_profile"
    )
    prompt = [prompt]
    response = provider_invoke("translator_profile", prompt).content
    if not isinstance(response, str):
        response = response[0]["text"]
        
    try:
        if matched := re.search(r'\{.*\}', response, re.DOTALL):
          matched = matched.group(0)
          return json.loads(matched)
          
        
        else:
            return {}
          
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):        
        return {}