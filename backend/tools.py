import urllib.error
import urllib.request

from duckduckgo_search import DDGS

SEARCH_TOOL_NAME = "web_search"
SEARCH_TOOL_DESCRIPTION = (
    "Search the web for current information. Use when the user asks about "
    "recent events, current prices, live data, news, or anything that may "
    "have changed after your training cutoff."
)

FETCH_TOOL_NAME = "fetch_url"
FETCH_TOOL_DESCRIPTION = (
    "Fetch and read the content of a specific URL. Use when the user provides "
    "a link and wants to know what is on that page."
)


def web_search(query: str, max_results: int = 5) -> list[dict]:
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=max_results))
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("href", ""),
            "snippet": r.get("body", ""),
        }
        for r in results
    ]


def format_results(results: list[dict]) -> str:
    if not results:
        return "No results found."
    parts = []
    for i, r in enumerate(results, 1):
        parts.append(f"{i}. {r['title']}\n   URL: {r['url']}\n   {r['snippet']}")
    return "\n\n".join(parts)


def fetch_url(url: str, max_chars: int = 6000) -> str:
    # Use Jina reader to handle JS-rendered pages and extract clean text
    reader_url = f"https://r.jina.ai/{url}"
    req = urllib.request.Request(
        reader_url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "text/plain"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read(300_000).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return f"HTTP error {e.code}: {e.reason}"
    except Exception as e:
        return f"Could not fetch URL: {e}"

    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[content truncated]"
    return text or "No readable content found."
