import os
from huggingface_hub import InferenceClient
from dotenv import load_dotenv

load_dotenv()

model = InferenceClient(
    model=os.getenv("MODEL_NAME"),
    api_key=os.getenv("HUGGINGFACE_API_KEY"),
)

TEMPERATURE = os.getenv("TEMPERATURE")

# only import 'model' and 'TEMPERATURE' objects
__all__ = ["model", "TEMPERATURE"]
