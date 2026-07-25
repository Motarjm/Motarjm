import json
from langchain.tools import tool
from langchain_exa import ExaSearchResults

# searching the web for relevant information to answer a question
search_tool = ExaSearchResults()

"""
def _run(
        self,
        query: str,
        num_results: int = 10,
        text_contents_options: TextContentsOptions  # noqa: FBT001
        | dict[str, Any]
        | bool
        | None = None,
        highlights: HighlightsContentsOptions | bool | None = None,  # noqa: FBT001
        include_domains: list[str] | None = None,
        exclude_domains: list[str] | None = None,
        start_crawl_date: str | None = None,
        end_crawl_date: str | None = None,
        start_published_date: str | None = None,
        end_published_date: str | None = None,
        use_autoprompt: bool | None = None,  # noqa: FBT001
        livecrawl: Literal["always", "fallback", "never"] | None = None,
        summary: bool | dict[str, str] | None = None,  # noqa: FBT001
        type: Literal["auto", "deep", "fast"] | None = None,  # noqa: A002
        run_manager: CallbackManagerForToolRun | None = None,
        )
"""

@tool
def exa_search(query: str, 
               include_domains: list[str] | None = None,
               exclude_domains: list[str] | None = None) -> str:
    """Search the web for up-to-date information. Use for current events, 
    recent research, terminology questions, or anything beyond your training data.
    
     Args:
        query: The search query. Be specific and concise, like a real search
            engine query rather than a full sentence.
        include_domains: Optional list of bare domains (e.g. "nature.com",
            "arxiv.org") to restrict results to. Only set this when the user
            asks for a specific source/site, or the question clearly belongs
            to a narrow domain (e.g. academic papers, a specific news outlet).
            Leave as None for general queries.
        exclude_domains: Optional list of bare domains to exclude from
            results — e.g. to filter out low-quality aggregators or a site
            the user explicitly doesn't want. Leave as None unless there's a
            clear reason to exclude something.
    """
    # You can transform/validate the query here before it hits Exa
    # query = f"{query} site:arxiv.org OR site:nature.com"  # force domain
    raw = search_tool._run(query,
                           num_results = 5,
                            highlights = True,
                            include_domains = include_domains,
                            exclude_domains = exclude_domains,
                            text_contents_options={"max_characters": 1000},  # Limit text length
                            type="auto")

    # Exa may return an object with `.results` or a plain list depending on version.
    # Normalize to a small JSON blob so downstream code (and the LLM) can rely on
    # a fixed shape: {"query": ..., "results": [{"title", "url", "text"}, ...]}
    # print(raw)
    raw_results = getattr(raw, "results", raw)
    if not isinstance(raw_results, list):
        raw_results = []

    normalized = []
    for r in raw_results:
        if isinstance(r, dict):
            title = r.get("title")
            url = r.get("url")
            text = r.get("text") or r.get("highlights")
        else:
            title = getattr(r, "title", None)
            url = getattr(r, "url", None)
            text = getattr(r, "text", None) or getattr(r, "highlights", None)

        if isinstance(text, list):
            text = " ".join(str(t) for t in text)

        if url:
            normalized.append({
                "title": title or url,
                "url": url,
                "text": (text or ""),
            })

    return json.dumps({"query": query, "results": normalized}, ensure_ascii=False)
