from pydantic import BaseModel, Field
from typing import List
from typing_extensions import TypedDict, Annotated
import operator
from langchain.messages import AnyMessage


class State(BaseModel):
  source_lang: str
  target_lang: str
  source_text: str
  prev_context: str
  # llm's extracted terminology from the doc with its translations for those terms 
  # (if the user didnt provide glossary)
  terminology: str = ""
  # the user's provided glossary that is matched against llm's extracted terms and used if there is a match
  glossary: dict = Field(default_factory=dict)
  style_guide: str = ""
  messages: Annotated[List[AnyMessage], operator.add] = []
  current_translation: str = ""
  current_advice: str = ""
  current_eval: str = ""
  current_score: int = 0
  iteration: int = 0
  max_iterations: int = 2
  score_threshold: int = 99
  exit: bool = False
