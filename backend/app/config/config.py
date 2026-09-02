import os
from dotenv import load_dotenv

# Only load .env locally, Azure App Settings are read automatically
if not os.getenv("WEBSITE_SITE_NAME"):
    load_dotenv()  # only runs on local machine


os.environ["OPENROUTER_API_KEY"] = os.getenv("OPENROUTER_API_KEY")
os.environ["LANGSMITH_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
os.environ["LANGSMITH_TRACING"] = os.getenv("LANGSMITH_TRACING")
os.environ["LANGSMITH_PROJECT"] = "Turjman"
os.environ["LANGSMITH_ENDPOINT"] = "https://eu.api.smith.langchain.com"
os.environ["EXA_API_KEY"] = os.getenv("EXA_API_KEY")
os.environ['DATABASE_URL'] = os.getenv('DATABASE_URL')
os.environ["LMNR_PROJECT_API_KEY"] = os.getenv("LMNR_PROJECT_API_KEY")
os.environ["LANGFUSE_SECRET_KEY"] = os.getenv("LANGFUSE_SECRET_KEY")
os.environ["LANGFUSE_PUBLIC_KEY"] = os.getenv("LANGFUSE_PUBLIC_KEY")
os.environ["LANGFUSE_BASE_URL"] = os.getenv("LANGFUSE_BASE_URL")
# below line for testing
# os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "1"
# os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "1"




