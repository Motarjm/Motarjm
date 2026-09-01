from langfuse import get_client
from lmnr import Laminar

_langfuse = get_client()

def get_prompt(name: str, **format_vars) -> str:
    """
    Fetch a prompt from Langfuse (production label), compile it, and
    tag the current Laminar trace with the prompt name/version.
    """
    lf_prompt = _langfuse.get_prompt(name)
    template = lf_prompt.get_langchain_prompt()
    compiled = template.format(**format_vars)

     # Tags the CURRENT active span (e.g. the LangGraph node's task span)
    Laminar.add_span_tags([
        f"{lf_prompt.name}: version {lf_prompt.version}",
    ])
    
  
    return compiled

# Fallback used wherever no real translator profile is available (e.g. terminology
# extraction, backtranslation) so TRANSLATOR_SYS_PROMPT.format() never leaks a
# literal "{{user_role}}" into the prompt.
DEFAULT_TRANSLATOR_ROLE = "an expert translator"