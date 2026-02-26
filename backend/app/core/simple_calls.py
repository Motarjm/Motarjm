import json
import re
from langchain.messages import AIMessage, HumanMessage, SystemMessage
from app.core.prompts import *
from app.core.agents import provider_invoke
from typing import List

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


def generate_suggestions(source_text: str, source_lang: str, translation: str, target_lang: str, page_context: List):
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
    sys_prompt = SystemMessage(
        content = SUGGESTIONS_SYS_PROMPT,
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
        response3 = response3[1]["text"]

    # hardcoded for now, should be more sophisticated
    return {
        "Gemini": response1,
        "Grok": response2,
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
        content=TRANSLATOR_PROMPT.format(
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