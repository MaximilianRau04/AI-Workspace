import json
import os
import urllib.error
import urllib.request

from duckduckgo_search import DDGS

import sandbox

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


EXECUTE_CODE_TOOL_NAME = "execute_code"
EXECUTE_CODE_TOOL_DESCRIPTION = (
    "Execute code in an isolated Docker container and return stdout/stderr. "
    "Supported languages: python, javascript, typescript, bash, ruby, php, perl, elixir, lua, c, cpp, java, go, rust, csharp. "
    "Java: the public class must be named Main. C#: uses Mono (class-based programs). "
    "Use when asked to run, compute, or test something in code."
)


# The executor may first wait for a free slot, then run the code, then kill a
# timed-out container; the app must wait at least that long for its answer.
EXECUTOR_REQUEST_TIMEOUT = sandbox.QUEUE_TIMEOUT_SECONDS + sandbox.TIMEOUT_SECONDS + 20


def execute_code(code: str, language: str) -> dict:
    executor_url = os.getenv("CODE_EXECUTOR_URL", "").strip()
    if not executor_url:
        return sandbox.run_code(code, language)
    # The app has no Docker socket in this setup; a separate executor service runs the code.
    req = urllib.request.Request(
        executor_url.rstrip("/") + "/run",
        data=json.dumps({"code": code, "language": language}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.getenv('CODE_EXECUTOR_TOKEN', '')}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=EXECUTOR_REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {"stdout": "", "stderr": f"Code executor unavailable: {exc}", "exit_code": 1}


def format_code_result(result: dict) -> str:
    parts = [f"Exit code: {result['exit_code']}"]
    if result["stdout"]:
        parts.append(f"Stdout:\n{result['stdout'].rstrip()}")
    if result["stderr"]:
        parts.append(f"Stderr:\n{result['stderr'].rstrip()}")
    if not result["stdout"] and not result["stderr"]:
        parts.append("(no output)")
    return "\n\n".join(parts)
