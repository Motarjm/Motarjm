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
    if not isinstance(response3, str):
        response3 = response3[0]["text"]

    # hardcoded for now, should be more sophisticated
    return {
        "Gemini": response1,
        "Grok": response2,
        "DeepSeek": response3
    }