import json
import re
import logging
from langchain.messages import AIMessage, HumanMessage, SystemMessage
from app.core.prompts import *
# the below line is for testing purposes
from app.config.config import *
from app.core.llms import *
from app.core.graph_models import *
from langsmith import traceable




@traceable(run_type="chain")
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
  
  if not provider_list:
    raise ValueError(f"No providers found for role: {role}")
  
  last_error = None
  
  for provider_idx, provider in enumerate(provider_list):
    for attempt in range(max_retries + 1):
      try:
        print(f"[{role}] Attempting provider {provider_idx + 1}/{len(provider_list)}, attempt {attempt + 1}/{max_retries + 1}")

        response = provider.invoke(prompt)

        print(f"[{role}] Success with provider {provider_idx + 1}: {response.response_metadata.get('model_name', 'unknown')}")
        print(response.response_metadata["model_name"])
        
        return response
        
      except Exception as e:
        last_error = e
        print(f"[{role}] Provider {provider_idx + 1} attempt {attempt + 1} failed: {str(e)}")

        # If this is not the last attempt for this provider, retry
        if attempt < max_retries:
          continue
        
        # If this is not the last provider, try the next one
        if provider_idx < len(provider_list) - 1:
          print(f"[{role}] Falling back to next provider...")
          break
        
        # If we've exhausted all providers and attempts, raise the error
        raise RuntimeError(
          f"All {len(provider_list)} providers failed for role '{role}' after {max_retries + 1} attempts each. "
          f"Last error: {str(last_error)}"
        ) from last_error


def provider_stream(role, prompt, max_retries=2):
  """
  Streams model response tokens based on available providers with retry logic.
  Falls back to next provider in the list on failure.
  
  Arguments:
    - role, str: the provider key (e.g. 'chatbot_deepseek', 'chatbot_gemini')
    - prompt, list: list of langchain messages
    - max_retries, int: number of retry attempts per provider (default: 2)
    
  Yields:
    - str: text chunks as they arrive
    
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
        print(f"[{role}] Streaming attempt with provider {provider_idx + 1}/{len(provider_list)}, attempt {attempt + 1}/{max_retries + 1}")
        
        for chunk in provider.stream(prompt):
          yield chunk
        
        print(f"[{role}] Stream completed successfully with provider {provider_idx + 1}")
        return
        
      except Exception as e:
        last_error = e
        print(f"[{role}] Provider {provider_idx + 1} stream attempt {attempt + 1} failed: {str(e)}")

        # If this is not the last attempt for this provider, retry
        if attempt < max_retries:
          continue
        
        # If this is not the last provider, try the next one
        if provider_idx < len(provider_list) - 1:
          print(f"[{role}] Stream failed, falling back to next provider...")
          break
        
        # If we've exhausted all providers and attempts, raise the error
        raise RuntimeError(
          f"All {len(provider_list)} providers failed for role '{role}' (stream) after {max_retries + 1} attempts each. "
          f"Last error: {str(last_error)}"
        ) from last_error


def translator_agent(state: State) -> dict:
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
  
  # empty string, no advice
  if not advice:
    sys_prompt = SystemMessage(
        content=TRANSLATOR_SYS_PROMPT,
        agent="TRANSLATOR")

    user_prompt = HumanMessage(
        content=TRANSLATOR_PROMPT.format(source_text = source_text,
                                         target_lang = target_lang,
                                        source_lang = source_lang,
                                        prev_context = prev_context,
                                        terminology = terminology
                                        ),
        agent="TRANSLATOR")

  # use advice and current translation
  else:
    sys_prompt = SystemMessage(
        content=TRANSLATOR_ADVICE_SYS_PROMPT,
        agent="TRANSLATOR")

    user_prompt = HumanMessage(
        content=TRANSLATOR_ADVICE_PROMPT.format(source_text = source_text,
                                                translation = translation,
                                                advice = advice,
                                                target_lang = target_lang,
                                                source_lang = source_lang,
                                                prev_context = prev_context,
                                                evaluation = evaluation,
                                                terminology = terminology

                                                ),
        agent="TRANSLATOR")


  prompt = [sys_prompt, user_prompt]

#  translation = translator.invoke(prompt).content
  translation = provider_invoke("translator", prompt).content
  if not isinstance(translation, str):
    translation = translation[0]["text"]

  return {"messages": prompt + [AIMessage(content=translation, agent="TRANSLATOR")],
          "current_translation": translation}


def evaluator_agent(state: State):
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
  
  sys_prompt = SystemMessage(
      content= EVALUATOR_SYS_PROMPT,
      agent="EVALUATOR")

  user_prompt = HumanMessage(
      content=EVALUATOR_PROMPT.format
       (
          source_text = source_text,
          translation= translation,
          target_lang = target_lang,
          source_lang = source_lang,
          prev_context = prev_context,
          terminology = terminology
        ),
       agent="EVALUATOR")


  prompt = [sys_prompt, user_prompt]

  # response = evaluator.invoke(prompt).content
  response = provider_invoke("evaluator", prompt).content
  
  if not isinstance(response, str):
    response = response[0]["text"]
    
  # transform response string into json, we should later use 'with_structued_output'
  if matched := re.search(r'\{.*\}', response, re.DOTALL):
    matched = matched.group(0)
    score = int(json.loads(matched)["score"])

  else:
    score = 0

  return {"messages": prompt + [AIMessage(content= response, agent="EVALUATOR")],
          "current_eval": response,
          "current_score": score}


def advisor_agent(state: State):
  """suggest revisions on the translation"""

  source_text = state.source_text
  messages = state.messages
  prev_context = state.prev_context
  # get current translation
  translation = state.current_translation
  source_lang = state.source_lang
  target_lang = state.target_lang
  terminology = state.terminology
  
  sys_prompt = SystemMessage(
      content= ADVISOR_SYS_PROMPT,
      agent="ADVISOR")


  user_prompt = HumanMessage(
      content=ADVISOR_PROMPT.format
       (
          source_text = source_text,
          translation= translation,
          target_lang = target_lang,
          source_lang = source_lang,
          prev_context = prev_context,
          terminology = terminology
        ),
       agent="ADVISOR")
  
  # get past messages of advisor agent
  history = []
  for msg in messages:
      if msg.agent == "ADVISOR" and not isinstance(msg, SystemMessage):
          history.append(msg)


  prompt = [sys_prompt] + history + [user_prompt]

  # advice = advisor.invoke(prompt).content
  advice = provider_invoke("advisor", prompt).content
  
  # grok output is in a list of dicts format, we need to extract the text from it
  if not isinstance(advice, str):
    advice = advice[0]["text"]

  return {"messages": [sys_prompt, user_prompt] + [AIMessage(content= advice, agent="ADVISOR")],
          "current_advice": advice}
# ToDO: terminology agent must have context to determine the appropriate translation for the terms
def terminology_agent(state: State):
  """
  Extract key terminology and difficult words from the text
  """
  source_text = state.source_text
  source_lang = state.source_lang
  target_lang = state.target_lang

  sys_prompt = SystemMessage(
      content=TRANSLATOR_SYS_PROMPT,
      agent="TERMINOLOGY"
  )

  user_prompt = HumanMessage(
      content=TERMINOLOGY_PROMPT.format(
          source_text=source_text,
          target_lang=target_lang,
          source_lang=source_lang
      ),
      agent="TERMINOLOGY"
  )

  prompt = [sys_prompt, user_prompt]

  # response = terminology.invoke(prompt).content
  response = provider_invoke("terminology", prompt).content
  if not isinstance(response, str):
    response = response[0]["text"]

  return {"messages": prompt + [AIMessage(content=response, agent="TERMINOLOGY")],
          "terminology": response}


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

