import os
from dotenv import load_dotenv

# Only load .env locally, Azure App Settings are read automatically
if not os.getenv("WEBSITE_SITE_NAME"):
    load_dotenv()  # only runs on local machine

os.environ["HUGGINGFACEHUB_API_TOKEN"] = os.getenv("HUGGINGFACE_API_KEY")
os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY")
os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
os.environ["LANGSMITH_TRACING"] = os.getenv("LANGSMITH_TRACING")
os.environ["LANGSMITH_PROJECT"] = "Turjman"
os.environ["LANGSMITH_ENDPOINT"] = "https://eu.api.smith.langchain.com"
# below line for testing
# os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "1"
# os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "1"




