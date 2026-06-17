from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

# Deepseek doesnt always apply instructions  as intended.
# Even when given explicit instructrions to not translate context, sometimes it translates it.

#ToDo: migrate from google_genai and open_ai langchain packages to langchain openrouter package
deepseek = ChatOpenAI(
    model="deepseek/deepseek-v3.2",
    # model="qwen/qwen-2.5-72b-instruct",
    base_url="https://openrouter.ai/api/v1",
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0
    max_tokens = 1024,
    reasoning = {
        "effort": "none",
    }

)

gemini_2_5_flash_lite = ChatOpenAI(
    model="google/gemini-2.5-flash-lite",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 4096,
    temperature=0.01,
    reasoning = {
        "effort": "none",
    }
    
)

gemini_3_flash_prev = ChatOpenAI(
    model="google/gemini-3-flash-preview",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 2048,
    temperature=0.01,
    reasoning = {
        "effort": "none",
    }
    
)

claude_haiku_4_5 = ChatOpenAI(
    model="anthropic/claude-haiku-4.5",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 2048,
    temperature=0.01,
    reasoning = {
        "effort": "none",
    }
    
)
claude_sonnet_4_6 = ChatOpenAI(
    model="anthropic/claude-sonnet-4.6",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 2048,
    temperature=0.01,
    reasoning = {
        "effort": "none",
    }
)
grok = ChatOpenAI(
    model="x-ai/grok-4.1-fast",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 1024,
    # max_retries=0,
    temperature=0.6,  # Gemini 3.0+ defaults to 1.0,
    reasoning = {
        "effort": "none",
    }
)


gpt_5_nano  = ChatOpenAI(
    model="openai/gpt-5-nano",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 1024,
    # max_retries=0,
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0,
    reasoning = {
        "effort": "low",
    }
)


providers = {"translator": [claude_sonnet_4_6,
                            deepseek],
                                # deepseek,
             
             "evaluator": [deepseek, grok],
                        
                 
             
             "advisor": [gemini_3_flash_prev,deepseek],
                          
             
             "terminology": [gemini_3_flash_prev,
                             deepseek],
                #  deepseek],
             
             "explanator": [gemini_2_5_flash_lite,deepseek],

             "suggestions1": [gemini_2_5_flash_lite],
             "suggestions2": [claude_haiku_4_5], # grok
             
             "suggestions3": [gpt_5_nano], # gpt5 nano,
             
             "backtranslation": [gemini_2_5_flash_lite],

             # chatbot — keyed by frontend model name
             "chatbot_deepseek": [deepseek],    # deepseek
             "chatbot_gemini": [gemini_3_flash_prev],  # gemini
             "chatbot_grok": [grok],            # grok
             
             "doc_summary": [gemini_2_5_flash_lite],
             "reviewer": [claude_haiku_4_5]

             }

 


__all__ = ["providers"]



