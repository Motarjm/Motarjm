from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

# GOOGLE MODELS
google_translator = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.01,  # Gemini 3.0+ defaults to 1.0
    max_tokens=1024,
    timeout=None,
    max_retries=0,
    # other params...
)

google_evaluator = google_translator
google_advisor = google_translator


# HUGGINGFACE MODELS
hugging_translator = ChatHuggingFace( llm=HuggingFaceEndpoint(
    repo_id="meta-llama/Llama-3.1-8B-Instruct",
    max_new_tokens=512,
    do_sample=True,
    temperature=0.3,
    provider="auto",
),
                                    max_retries = 0

)

hugging_evaluator = hugging_translator
hugging_advisor = hugging_translator


# OPEN ROUTER MODELS
openrouter_translator = ChatOpenAI(
    model="deepseek/deepseek-r1-0528:free",
    base_url="https://openrouter.ai/api/v1",
    max_retries=0
)

openrouter_evaluator = openrouter_translator
openrouter_advisor = openrouter_translator




OPENROUTER = {
    "translator": openrouter_translator,
    "evaluator": openrouter_evaluator,
    "advisor": openrouter_advisor
}

GOOGLE = {
    "translator": google_translator,
    "evaluator": google_evaluator,
    "advisor": google_advisor
}

HUGGINGFACE = {
    "translator": hugging_translator,
    "evaluator": hugging_evaluator,
    "advisor": hugging_advisor
}

providers = [OPENROUTER, GOOGLE, HUGGINGFACE]
 


__all__ = ["providers"]

