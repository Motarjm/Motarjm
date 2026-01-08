from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

# Translators 

# google
translator_1 = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0
    max_tokens=1024,
    timeout=None,
    max_retries=0,
    # other params...
) 
# openrouter
translator_2 = ChatOpenAI(
    model="google/gemma-3-27b-it:free",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 1024,
    max_retries=0
)

# hugging
translator_3 = ChatHuggingFace( llm=HuggingFaceEndpoint(
    repo_id="deepseek-ai/DeepSeek-V3.2",
    max_new_tokens=1024,
    do_sample=True,
    temperature=0.3,
    provider="auto",
),
                                    max_retries = 0

)



# Evaluators

# hugging
evaluator_1 = ChatHuggingFace( llm=HuggingFaceEndpoint(
    repo_id="Qwen/Qwen2.5-7B-Instruct",
    max_new_tokens=1024,
    do_sample=True,
    temperature=0.3,
    provider="auto",
),
                                    max_retries = 0
)

# openrouter
evaluator_2 = ChatOpenAI(
    model="mistralai/mistral-7b-instruct:free",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 1024,
    max_retries=0
)
# google
evaluator_3 = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0
    max_tokens=1024,
    timeout=None,
    max_retries=0,
    # other params...
) 

# Advisors

# openrouter
advisor_1 = ChatOpenAI(
    model="deepseek/deepseek-r1-0528:free",
    base_url="https://openrouter.ai/api/v1",
    max_tokens = 1024,
    max_retries=0
)


# just for now
advisor_2 = advisor_1

# google
advisor_3 = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0
    max_tokens=1024,
    timeout=None,
    max_retries=0,
    # other params...
)


providers = {"translator": [translator_1,
                             translator_2,
                             translator_3], 
             
             "evaluator": [evaluator_1,
                            evaluator_2,
                            evaluator_3],
             
             "advisor": [advisor_1,
                          advisor_2,
                          advisor_3]
             }

 


__all__ = ["providers"]

