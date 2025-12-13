from pydantic import BaseModel
from typing import List
from typing_extensions import TypedDict, Annotated
import operator
from langchain.messages import AnyMessage


class State(BaseModel):
  source_lang: str
  target_lang: str
  source_text: str
  messages: Annotated[List[AnyMessage], operator.add] = []
  current_translation: str = ""
  current_advice: str = ""
  current_score: int = 0
  iteration: int = 0
  max_iterations: int = 2
  score_threshold: int = 99
  exit: bool = False
