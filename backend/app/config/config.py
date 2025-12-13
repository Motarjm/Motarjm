import os
from huggingface_hub import InferenceClient
from dotenv import load_dotenv

load_dotenv()

os.environ["HUGGINGFACEHUB_API_TOKEN"] = os.getenv("HUGGINGFACE_API_KEY")

model = InferenceClient(
    model=os.getenv("MODEL_NAME"),
    api_key=os.getenv("HUGGINGFACE_API_KEY"),
)

TEMPERATURE = float(os.getenv("TEMPERATURE"))

# only import 'model' and 'TEMPERATURE' objects
__all__ = ["model", "TEMPERATURE"]
