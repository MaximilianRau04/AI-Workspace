import resource
import subprocess
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


EXECUTE_CODE_TOOL_NAME = "execute_code"
EXECUTE_CODE_TOOL_DESCRIPTION = (
    "Execute code in a sandboxed subprocess and return stdout/stderr. "
    "Supported languages: python, javascript (Node.js), bash. "
    "Use when the user asks to run, compute, or test something in code."
)


def execute_code(code: str, language: str) -> dict:
    lang = language.lower().strip()
    runners: dict[str, list[str]] = {
        "python":     ["python3", "-c", code],
        "python3":    ["python3", "-c", code],
        "javascript": ["node", "-e", code],
        "js":         ["node", "-e", code],
        "bash":       ["bash", "-c", code],
        "sh":         ["bash", "-c", code],
    }
    cmd = runners.get(lang)
    if cmd is None:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language!r}. Use python, javascript, or bash.",
            "exit_code": 1,
        }

    def _set_limits():
        try:
            resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
            resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
        except Exception:
            pass

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,
            preexec_fn=_set_limits,
        )
        return {
            "stdout": result.stdout[:4000],
            "stderr": result.stderr[:2000],
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (15s limit).", "exit_code": 124}
    except FileNotFoundError as exc:
        return {"stdout": "", "stderr": f"Runtime not found: {exc}", "exit_code": 127}
    except Exception as exc:
        return {"stdout": "", "stderr": f"Execution error: {exc}", "exit_code": 1}


def format_code_result(result: dict) -> str:
    parts = [f"Exit code: {result['exit_code']}"]
    if result["stdout"]:
        parts.append(f"Stdout:\n{result['stdout'].rstrip()}")
    if result["stderr"]:
        parts.append(f"Stderr:\n{result['stderr'].rstrip()}")
    if not result["stdout"] and not result["stderr"]:
        parts.append("(no output)")
    return "\n\n".join(parts)
