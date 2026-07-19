from langchain_openai import ChatOpenAI
# from langchain.agents import create_agent
# from app.core.tools import search_tool
# from langchain.agents.middleware import ToolCallLimitMiddleware

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

gemini_2_5_flash_lite_low_tokens = ChatOpenAI(
    model="google/gemini-2.5-flash-lite",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 100,
    temperature=0.01,
    reasoning = {
        "effort": "none",
    }
    
)

gemini_3_1_flash_lite = ChatOpenAI(
    model="google/gemini-3.1-flash-lite",
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

gpt_4o_mini = ChatOpenAI(
    model="openai/gpt-4o-mini",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 100,
    # max_retries=0,
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0,
    reasoning = {
        "effort": "low",
    }
)

claude_haiku_4_5_low_tokens = ChatOpenAI(
    model="anthropic/claude-haiku-4.5",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 100,
    temperature=0.01,
    reasoning = {
        "effort": "none",
    }
)
#
# limiter = ToolCallLimitMiddleware(
#     run_limit=3,          # max 3 tool calls per agent.invoke()
#     exit_behavior="end"   # "end" = stop gracefully, "error" = raise exception
# )


# agent_gemini_3_flash_prev = create_agent(gemini_3_flash_prev,
#                                          [search_tool],
#                                          middleware = [limiter])
# agent_deepseek = create_agent(deepseek, 
#                               [search_tool],
#                               middleware = [limiter])

# agent_grok = create_agent(grok, 
#                           [search_tool],
#                           middleware = [limiter])



providers = {"translator": [claude_haiku_4_5,
                            deepseek],
                                # deepseek,
             
             "evaluator": [deepseek, grok],
                        
                 
             
             "advisor": [gemini_3_1_flash_lite,deepseek],
                          
             
             "terminology": [claude_haiku_4_5,
                             deepseek],
                #  deepseek],
             
             "explanator": [gemini_2_5_flash_lite,deepseek],

             "suggestions1": [gemini_2_5_flash_lite_low_tokens],
             "suggestions2": [claude_haiku_4_5_low_tokens], # grok
             
             "suggestions3": [gpt_4o_mini], # gpt5 nano,
             
             "backtranslation": [gemini_2_5_flash_lite],

             # chatbot — keyed by frontend model name
             "chatbot_deepseek": [deepseek],    # deepseek
             "chatbot_gemini": [gemini_3_1_flash_lite],  # gemini
             "chatbot_grok": [grok],            # grok
             "chatbot_claude": [claude_haiku_4_5],  # claude
             
             "doc_summary": [gemini_2_5_flash_lite],
             "reviewer": [claude_haiku_4_5],
             
             "general_chatbot_gemini": [gemini_3_1_flash_lite],
             "general_chatbot_deepseek": [deepseek],
             "general_chatbot_grok": [grok],
             "general_chatbot_claude": [claude_haiku_4_5]

             }

 


__all__ = ["providers"]



