import json
import re
import logging
import unicodedata
from typing import Dict, Optional
from rapidfuzz import process as rf_process
from rapidfuzz.distance import Levenshtein
from langchain.messages import AIMessage, HumanMessage, SystemMessage
from app.core.prompts import *
# the below line is for testing purposes
# from app.config.config import *
from app.core.llms import *
from app.core.graph_models import *
from lmnr import observe

logger = logging.getLogger(__name__)

def _extract_text(message) -> str:
  """Join all 'text' content_blocks from a message, skipping reasoning/other blocks."""
  text = "".join(
    block["text"] for block in message.content_blocks if block["type"] == "text"
  )
  if not text:
    raise ValueError(
      f"No text content_blocks found in response: {message.content_blocks!r}"
    )
  return text


def provider_invoke(role, prompt, max_retries=2):
  """
  Returns model response based on available providers with retry logic.
  Falls back to next provider in the list on failure.
  
  Arguments:
    - role, str: takes as input 'role' of the agent: 'translator', 'evaluator', 'advisor', etc.
    - prompt, list: list of langchain messages
    - max_retries, int: number of retry attempts per provider (default: 2)
    
  Returns:
    - response: output of '.invoke()'
    
  Raises:
    - Exception: if all providers fail
  """
  provider_list = providers.get(role, [])
  
  # if the llm is an agent, i must provide list of prompts as a dict
  # if role in ["general_chatbot_gemini", "general_chatbot_deepseek", "general_chatbot_grok"]:
  #   prompt = {"messages": prompt}
  
  
  if not provider_list:
    raise ValueError(f"No providers found for role: {role}")
  
  last_error = None
  
  for provider_idx, provider in enumerate(provider_list):
    for attempt in range(max_retries + 1):
      try:
        logger.debug("[%s] Attempting provider %d/%d, attempt %d/%d",
                     role, provider_idx + 1, len(provider_list), attempt + 1, max_retries + 1)

        response = provider.invoke(prompt)

        logger.debug("[%s] Success with provider %d: %s",
                     role, provider_idx + 1, response.response_metadata.get('model_name', 'unknown'))
        
        return response
        
      except Exception as e:
        last_error = e
        logger.warning("[%s] Provider %d attempt %d failed: %s",
                       role, provider_idx + 1, attempt + 1, e, exc_info=True)

        # If this is not the last attempt for this provider, retry
        if attempt < max_retries:
          continue
        
        # If this is not the last provider, try the next one
        if provider_idx < len(provider_list) - 1:
          logger.warning("[%s] Falling back to next provider...", role)
          break
        
        # If we've exhausted all providers and attempts, raise the error
        logger.error("[%s] All %d providers failed after %d attempts each. Last error: %s",
                     role, len(provider_list), max_retries + 1, last_error)
        raise RuntimeError(
          f"All {len(provider_list)} providers failed for role '{role}' after {max_retries + 1} attempts each. "
          f"Last error: {str(last_error)}"
        ) from last_error


async def provider_ainvoke(role, prompt, max_retries=2):
  """
  Async twin of provider_invoke — identical provider list, retry count,
  fallback order, and exception behavior. Only .invoke() -> .ainvoke() differs.

  Arguments:
    - role, str: takes as input 'role' of the agent: 'translator', 'evaluator', 'advisor', etc.
    - prompt, list: list of langchain messages
    - max_retries, int: number of retry attempts per provider (default: 2)
    
  Returns:
    - response: output of '.ainvoke()'
    
  Raises:
    - Exception: if all providers fail
  """
  provider_list = providers.get(role, [])

  if not provider_list:
    raise ValueError(f"No providers found for role: {role}")

  last_error = None

  for provider_idx, provider in enumerate(provider_list):
    for attempt in range(max_retries + 1):
      try:
        logger.debug("[%s] Attempting provider %d/%d, attempt %d/%d",
                     role, provider_idx + 1, len(provider_list), attempt + 1, max_retries + 1)

        response = await provider.ainvoke(prompt)
        
        logger.debug("[%s] Success with provider %d: %s",
                     role, provider_idx + 1, response.response_metadata.get('model_name', 'unknown'))

        return response

      except Exception as e:
        last_error = e
        logger.warning("[%s] Provider %d attempt %d failed: %s",
                       role, provider_idx + 1, attempt + 1, e, exc_info=True)

        if attempt < max_retries:
          continue

        if provider_idx < len(provider_list) - 1:
          logger.warning("[%s] Falling back to next provider...", role)
          break

        logger.error("[%s] All %d providers failed after %d attempts each. Last error: %s",
                     role, len(provider_list), max_retries + 1, last_error)
        raise RuntimeError(
          f"All {len(provider_list)} providers failed for role '{role}' after {max_retries + 1} attempts each. "
          f"Last error: {str(last_error)}"
        ) from last_error


async def provider_stream(role, prompt, max_retries=2, stream_mode=None, context=None):
  """
  Streams model response tokens based on available providers with retry logic.
  Falls back to next provider in the list on failure.
  
  Arguments:
    - role, str: the provider key (e.g. 'chatbot_deepseek', 'chatbot_gemini')
    - prompt, list: list of langchain messages
    - max_retries, int: number of retry attempts per provider (default: 2)
    - stream_mode, str | list | None: forwarded to the underlying LangGraph
      .astream() call when the provider is a compiled graph (e.g. an agent
      with tools). Pass a list like ["updates", "messages"] to get both
      step-level (node-level) updates (for tool-call detection) and token-level message
      chunks (for real streaming) in the same stream. Ignored (None) for
      plain chat-model providers.
    - context, dict | None: forwarded as `context=` to `.astream()`. This is
      how per-request data (e.g. document contents for extract_terminology)
      reaches tools bound to an agent via `runtime: ToolRuntime` — the tool
      itself is bound once at import time (see llms.py), and this context
      is what varies per call. Ignored for plain chat-model providers
      (they don't accept a context kwarg).
    
  Yields:
    - str (or graph chunk, depending on stream_mode): output as it arrives
    
  Raises:
    - Exception: if all providers fail
  """
  provider_list = providers.get(role, [])
  
  # if the llm is an agent, i must provide list of prompts as a dict
  is_agent_role = role in ["general_chatbot_gemini", "general_chatbot_claude", "general_chatbot_deepseek",
              "chatbot_deepseek", "chatbot_gemini",  "chatbot_claude"]
  if is_agent_role:
    prompt = {"messages": prompt}
  
  if not provider_list:
    raise ValueError(f"No providers found for role: {role}")
  
  last_error = None
  
  for provider_idx, provider in enumerate(provider_list):
    for attempt in range(max_retries + 1):
      try:
        logger.debug("[%s] Streaming attempt with provider %d/%d, attempt %d/%d",
                     role, provider_idx + 1, len(provider_list), attempt + 1, max_retries + 1)
        
        stream_kwargs = {"stream_mode": stream_mode} if stream_mode is not None else {}
        # Only compiled graphs (agents) accept `context=` — plain
        # chat-model providers (e.g. grok, used directly for the *_grok
        # roles) don't, so only pass it through for agent-based roles.
        if context is not None and is_agent_role:
          stream_kwargs["context"] = context
        async for chunk in provider.astream(prompt, **stream_kwargs,
                                     config={"run_name": role}):
          yield chunk
        
        logger.debug("[%s] Stream completed successfully with provider %d", role, provider_idx + 1)
        return
        
      except Exception as e:
        last_error = e
        logger.warning("[%s] Provider %d stream attempt %d failed: %s",
                       role, provider_idx + 1, attempt + 1, e, exc_info=True)

        # If this is not the last attempt for this provider, retry
        if attempt < max_retries:
          continue
        
        # If this is not the last provider, try the next one
        if provider_idx < len(provider_list) - 1:
          logger.warning("[%s] Stream failed, falling back to next provider...", role)
          break
        
        # If we've exhausted all providers and attempts, raise the error
        logger.error("[%s] All %d providers failed (stream) after %d attempts each. Last error: %s",
                     role, len(provider_list), max_retries + 1, last_error)
        raise RuntimeError(
          f"All {len(provider_list)} providers failed for role '{role}' (stream) after {max_retries + 1} attempts each. "
          f"Last error: {str(last_error)}"
        ) from last_error


async def translator_agent(state: State) -> dict:
  """
  Translates the given text and returns output translation
  """
  source_text = state.source_text
  source_lang = state.source_lang
  target_lang = state.target_lang
  prev_context = state.prev_context
  advice = state.current_advice
  translation = state.current_translation
  evaluation = state.current_eval
  terminology = state.terminology
  style_guide = state.style_guide
  user_role = state.user_role or DEFAULT_TRANSLATOR_ROLE
  user_preferences = "\n".join(f"- {p}" for p in state.user_preferences if p and p.strip()) if state.user_preferences else ""

  # empty string, no advice
  if not advice:
    sys_prompt_content = TRANSLATOR_SYS_PROMPT.format(
                                        user_role=user_role,
                                        target_lang = target_lang,
                                        source_lang = source_lang,
                                        terminology = terminology,
                                        user_preferences = user_preferences)
    if style_guide:
      sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
    
    sys_prompt = SystemMessage(
        content=sys_prompt_content,
        agent="TRANSLATOR")

    user_prompt = HumanMessage(
        content=TRANSLATOR_PROMPT.format(
                                        source_text = source_text,
                                        prev_context = prev_context,
                                        ),
        agent="TRANSLATOR")

  # use advice and current translation
  else:
    sys_prompt_content = TRANSLATOR_ADVICE_SYS_PROMPT.format(
                                                user_role=user_role,             
                                                target_lang = target_lang,
                                                source_lang = source_lang,
                                                terminology = terminology,
                                                user_preferences = user_preferences)
    if style_guide:
      sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
    
    sys_prompt = SystemMessage(
        content=sys_prompt_content,
        agent="TRANSLATOR")

    user_prompt = HumanMessage(
        content=TRANSLATOR_ADVICE_PROMPT.format(source_text = source_text,
                                                translation = translation,
                                                advice = advice,
                                                prev_context = prev_context,
                                                evaluation = evaluation,
                                                ),
        agent="TRANSLATOR")


  prompt = [sys_prompt, user_prompt]

  translation = _extract_text(await provider_ainvoke("translator", prompt))

  return {"messages": prompt + [AIMessage(content=translation, agent="TRANSLATOR")],
          "current_translation": translation}


async def evaluator_agent(state: State):
  """
  Evaluates the translation using source text and the translation
  """
  source_text = state.source_text
  prev_context = state.prev_context
  # get current translation
  translation = state.current_translation
  source_lang = state.source_lang
  target_lang = state.target_lang
  terminology = state.terminology
  style_guide = state.style_guide
  
  sys_prompt_content = EVALUATOR_SYS_PROMPT.format(  
          terminology = terminology,
          target_lang = target_lang,
          source_lang = source_lang)
  
  if style_guide:
    sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
  
  sys_prompt = SystemMessage(
      content= sys_prompt_content,
      agent="EVALUATOR")

  user_prompt = HumanMessage(
      content=EVALUATOR_PROMPT.format
       (
          source_text = source_text,
          translation= translation,
          prev_context = prev_context
        ),
       agent="EVALUATOR")


  prompt = [sys_prompt, user_prompt]

  response = _extract_text(await provider_ainvoke("evaluator", prompt))
  
  # transform response string into json, we should later use 'with_structued_output'
  
  try:
    if matched := re.search(r'\{.*\}', response, re.DOTALL):
      matched = matched.group(0)
      score = int(json.loads(matched)["score"])
    
    else:
      score = 0
      
  except (json.JSONDecodeError, KeyError, TypeError, ValueError):
    score = 0

  return {"messages": prompt + [AIMessage(content= response, agent="EVALUATOR")],
          "current_eval": response,
          "current_score": score}


async def advisor_agent(state: State):
  """suggest revisions on the translation"""

  source_text = state.source_text
  messages = state.messages
  prev_context = state.prev_context
  # get current translation
  translation = state.current_translation
  source_lang = state.source_lang
  target_lang = state.target_lang
  terminology = state.terminology
  style_guide = state.style_guide
  user_preferences = "\n".join(f"- {p}" for p in state.user_preferences if p and p.strip()) if state.user_preferences else ""
  
  sys_prompt_content = ADVISOR_SYS_PROMPT.format(
    target_lang = target_lang,
    source_lang = source_lang,
    terminology = terminology,
    user_preferences = user_preferences
  )
  
  if style_guide:
    sys_prompt_content += f"\n\n{STYLE_GUIDE_ADD_ON.format(style_rules=style_guide)}"
  
  sys_prompt = SystemMessage(
      content= sys_prompt_content,
      agent="ADVISOR")


  user_prompt = HumanMessage(
      content=ADVISOR_PROMPT.format
       (
          source_text = source_text,
          translation= translation,
          prev_context = prev_context
        ),
       agent="ADVISOR")
  
  # get past messages of advisor agent
  history = []
  for msg in messages:
      if msg.agent == "ADVISOR" and not isinstance(msg, SystemMessage):
          history.append(msg)


  prompt = [sys_prompt] + history + [user_prompt]

  advice = _extract_text(await provider_ainvoke("advisor", prompt))

  return {"messages": [sys_prompt, user_prompt] + [AIMessage(content= advice, agent="ADVISOR")],
          "current_advice": advice}

def increment_iteration(state: State):
  """
  Increment number of iterations and check if reached max iterations
  if true return exit flag to exit loop
  else continue to evaluator agent
  """
  iteration = state.iteration
  max_iterations = state.max_iterations

  iteration += 1

  # exit if reached max iterations
  if iteration >= max_iterations:
    return {"messages": [AIMessage(content = f"Exiting Loop. Max Number of iterations met \nIter: {iteration}",
                                   agent="increment_iteration")],
            "exit": True}

  else:
    return {"iteration": iteration}


def check_score(state: State):
  """
  after evaluator agent

  check score of evaluator agent, if greater than or equal exit the loop
  else continue to advisor agent
  """
  score_threshold = state.score_threshold

  score = state.current_score

  # exit if score is greater than or equal threshold
  if score >= score_threshold:
    return {"messages": [AIMessage(content = f"Exiting Loop. Score of translation is greater than threshold\n score:{score} | threshold: {score_threshold}",
                         agent="check_score")],
            "exit": True}

  else:
    return {"messages": []}



def _safe_parse_terminology_json(raw_text: str) -> Optional[Dict[str, str]]:
  # Parse raw LLM output into a dict; tolerate extra text around JSON.
  if not raw_text:
    return None

  try:
    return json.loads(raw_text)
  except json.JSONDecodeError:
    pass

  if matched := re.search(r'\{.*\}', raw_text, re.DOTALL):
    try:
      return json.loads(matched.group(0))
    except json.JSONDecodeError:
      return None

  return None


def _normalize_term(value: str) -> str:
  # Normalize by casefolding and removing whitespace/punctuation/symbols.
  if not value:
    return ""
  folded = value.casefold()
  filtered = []
  for char in folded:
    if char.isspace():
      continue
    category = unicodedata.category(char)
    if category.startswith("P") or category.startswith("S"):
      continue
    filtered.append(char)
  return "".join(filtered)


def _apply_glossary_matches(
  terminology: Dict[str, str],
  glossary: Dict[str, str],
  score_cutoff: float = 0.9,
) -> Dict[str, str]:
  # Replace LLM translations with glossary translations on best fuzzy match.
  """
  The LLM terminology is always the base layer — the glossary only overrides entries where it has a confident match. 
  Everything else falls through unchanged.
  """
  
  if not glossary:
    return terminology

  # Build normalized glossary lookup for RapidFuzz matching.
  choices = []
  choice_map = []
  for term, translation in glossary.items():
    normalized = _normalize_term(term)
    if not normalized:
      continue
    if normalized in choices:
      continue
    choices.append(normalized)
    choice_map.append((term, translation))

  if not choices:
    return terminology

  matched: Dict[str, str] = {}
  for term, llm_translation in terminology.items():
    normalized_term = _normalize_term(term)
    if not normalized_term:
      matched[term] = llm_translation
      continue

    # Use Levenshtein normalized similarity to pick best glossary term.
    result = rf_process.extractOne(
      normalized_term,
      choices,
      scorer=Levenshtein.normalized_similarity,
      score_cutoff=score_cutoff,
    )

    if result is None:
      matched[term] = llm_translation
      continue

    _, _, idx = result
    _, glossary_translation = choice_map[idx]
    matched[term] = glossary_translation

  return matched