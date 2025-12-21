import json
import re
from langchain.messages import AIMessage, HumanMessage, SystemMessage
from app.core.prompts import *
from app.core.llms import *
from app.core.graph_models import *

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

  # empty string, no advice
  if not advice:
    sys_prompt = SystemMessage(
        content=TRANSLATOR_SYS_PROMPT,
        agent="TRANSLATOR")

    user_prompt = HumanMessage(
        content=TRANSLATOR_PROMPT.format(source_text = source_text,
                                         target_lang = target_lang,
                                        source_lang = source_lang,
                                        prev_context = prev_context),
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
                                                prev_context = prev_context
                                                ),
        agent="TRANSLATOR")


  prompt = [sys_prompt, user_prompt]

  translation = translator.invoke(prompt).content

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
          prev_context = prev_context
        ),
       agent="EVALUATOR")


  prompt = [sys_prompt, user_prompt]

  response = evaluator.invoke(prompt).content

  # transform response string into json, we should later use 'with_structued_output'
  if matched := re.search(r'\{.*\}', response, re.DOTALL):
    matched = matched.group(0)
    score = int(json.loads(matched)["score"])

  else:
    score = 0

  return {"messages": prompt + [AIMessage(content= response, agent="EVALUATOR")],
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
          prev_context = prev_context
        ),
       agent="ADVISOR")
  
  # get past messages of advisor agent
  history = []
  for msg in messages:
      if msg.agent == "ADVISOR" and not isinstance(msg, SystemMessage):
          history.append(msg)


  prompt = [sys_prompt] + history + [user_prompt]

  advice = advisor.invoke(prompt).content

  return {"messages": prompt + [AIMessage(content= advice, agent="ADVISOR")],
          "current_advice": advice}


def increment_iteration(state: State):
  """
  runs before evaluator agent

  Increment number of iterations and check if reached max iterations
  if true return exit flag to exit loop
  else continue to evaluator agent
  """
  iteration = state.iteration
  max_iterations = state.max_iterations

  iteration += 1

  # exit if reached max iterations
  if iteration >= max_iterations:
    return {"messages": [AIMessage(content = f"Skipping evaluator. Max Number of iterations met \nIter: {iteration}")],
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
    return {"messages": [AIMessage(content = f"Exiting Loop. Score of translation is greater than threshold\n score:{score} | threshold: {score_threshold}")],
            "exit": True}

  else:
    return {"messages": []}

