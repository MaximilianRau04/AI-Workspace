"""
Provider-agnostic LLM abstraction.

Internally uses Gemini-format messages throughout:
  [{"role": "user"/"model", "parts": ["content"]}, ...]

stream_chat() yields str chunks, {"thinking": str} for reasoning content,
and as the final item may yield a {"usage": {...}} dict (Gemini only).
"""

from __future__ import annotations

import itertools
import json
import os
import re
from typing import Iterator

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "model_config.json")

DEFAULTS: dict = {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key": "",
    "base_url": "",
    "reasoning": False,
    "presets": [],
    "stt_backend": "google",
}

MAX_AGENT_STEPS = 10


# ---------------------------------------------------------------------------
# Prompt-based tool dispatch (fallback for models without native tool calling)
# ---------------------------------------------------------------------------


def _build_tool_addendum(web_search: bool, code_interpreter: bool) -> str:
    if not web_search and not code_interpreter:
        return ""
    lines = [
        "\n\nYou have access to the following tools. When you need to use one, respond with ONLY this JSON block and nothing else before or after it:",
        '<tool_call>{"name": "<tool_name>", "args": {<args_json>}}</tool_call>',
        "\nAvailable tools:",
    ]
    if web_search:
        lines.append(
            '- web_search: Search the web for current information. Args: {"query": "your search query"}'
        )
        lines.append(
            '- fetch_url: Fetch and read the content of a URL. Args: {"url": "https://example.com"}'
        )
    if code_interpreter:
        lines.append(
            '- execute_code: Execute code. Args: {"language": "python|javascript|typescript|bash|ruby|php|perl|elixir|lua|c|cpp|java|go", "code": "your code"}'
        )
    lines.append("\nOnly use a tool when needed. Otherwise answer normally.")
    return "\n".join(lines)


def _parse_prompt_tool_call(text: str) -> dict | None:
    m = re.search(r"<tool_call>(.*?)</tool_call>", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1).strip())
    except Exception:
        return None


def load_config() -> dict:
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return {**DEFAULTS, **json.load(f)}
    return DEFAULTS.copy()


def save_config(cfg: dict) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


def stream_chat(
    messages: list[dict],
    system_prompt: str = "",
    web_search: bool = False,
    code_interpreter: bool = False,
) -> Iterator[str | dict]:
    """
    Yield text chunks from the configured LLM.
    May yield {"thinking": str} chunks for reasoning content.
    May yield {"searching": str} when a web_search tool call is in progress.
    May yield {"executing": {"language": str, "code": str}} before code execution.
    May yield {"code_result": {"language": str, "code": str, "stdout": str, "stderr": str, "exit_code": int}}.
    The final item may be {"usage": {"prompt": N, "reply": N, "total": N}}.
    messages format: [{"role": "user"/"model", "parts": ["..."]}]
    """
    cfg = load_config()
    provider = cfg["provider"]
    if provider == "gemini":
        yield from _stream_gemini(messages, system_prompt, cfg, web_search, code_interpreter)
    elif provider == "openai":
        yield from _stream_openai(messages, system_prompt, cfg, web_search, code_interpreter)
    elif provider == "anthropic":
        yield from _stream_anthropic(messages, system_prompt, cfg, web_search, code_interpreter)
    else:
        raise ValueError(f"Unknown provider: {provider!r}")


def generate_text(prompt: str) -> str:
    """Single-turn non-streaming call (title/summary generation)."""
    cfg = load_config()
    provider = cfg["provider"]
    if provider == "gemini":
        return _generate_gemini(prompt, cfg)
    elif provider == "openai":
        return _generate_openai(prompt, cfg)
    elif provider == "anthropic":
        return _generate_anthropic(prompt, cfg)
    else:
        raise ValueError(f"Unknown provider: {provider!r}")


def list_ollama_models(base_url: str) -> list[str]:
    """Return model names from a running Ollama instance."""
    import urllib.error
    import urllib.request

    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    try:
        with urllib.request.urlopen(f"{base}/api/tags", timeout=4) as r:
            data = json.loads(r.read())
        return [m["name"] for m in data.get("models", [])]
    except Exception as exc:
        raise RuntimeError(f"Could not reach Ollama at {base}: {exc}") from exc


# ---------------------------------------------------------------------------
# Format helpers
# ---------------------------------------------------------------------------


def _to_openai_messages(messages: list[dict]) -> list[dict]:
    return [
        {
            "role": "assistant" if m["role"] in ("model", "assistant") else m["role"],
            "content": m["parts"][0],
        }
        for m in messages
    ]


def _cot_addendum() -> str:
    return "\n\nBefore answering, reason step by step inside <think></think> tags."


def _parse_think_tags(text_iter: Iterator[str]) -> Iterator[str | dict]:
    """
    Parse <think>...</think> blocks from a text stream.
    Yields str for answer text and {"thinking": str} for reasoning content.
    Handles tags split across chunk boundaries.
    """
    TAG_OPEN = "<think>"
    TAG_CLOSE = "</think>"
    in_think = False
    buf = ""

    for text in text_iter:
        buf += text
        while True:
            if not in_think:
                idx = buf.find(TAG_OPEN)
                if idx == -1:
                    # Keep a small tail in case the tag is split across chunks
                    safe = buf[: max(0, len(buf) - len(TAG_OPEN))]
                    if safe:
                        yield safe
                        buf = buf[len(safe) :]
                    break
                if idx > 0:
                    yield buf[:idx]
                buf = buf[idx + len(TAG_OPEN) :]
                in_think = True
            else:
                idx = buf.find(TAG_CLOSE)
                if idx == -1:
                    safe = buf[: max(0, len(buf) - len(TAG_CLOSE))]
                    if safe:
                        yield {"thinking": safe}
                        buf = buf[len(safe) :]
                    break
                if idx > 0:
                    yield {"thinking": buf[:idx]}
                buf = buf[idx + len(TAG_CLOSE) :]
                in_think = False

    if buf:
        yield {"thinking": buf} if in_think else buf


# ---------------------------------------------------------------------------
# Shared tool runner
# ---------------------------------------------------------------------------


def _run_tool(name: str, args: dict) -> tuple[list[dict], str]:
    """Execute a tool call. Returns (events_to_yield, result_text)."""
    from tools import execute_code, fetch_url, format_code_result, format_results, web_search

    if name == "web_search":
        query = args.get("query", "")
        return [{"searching": query}], format_results(web_search(query))
    if name == "fetch_url":
        url = args.get("url", "")
        return [{"searching": url}], fetch_url(url)
    if name == "execute_code":
        lang = args.get("language", "python")
        code = args.get("code", "")
        result = execute_code(code, lang)
        return [
            {"executing": {"language": lang, "code": code}},
            {"code_result": {"language": lang, "code": code, **result}},
        ], format_code_result(result)
    return [], f"Unknown tool: {name}"


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

_GEMINI_THINKING_MODELS = ("gemini-2.5-flash", "gemini-2.5-pro")


def _get_gemini_key(cfg: dict) -> str:
    key = cfg.get("api_key") or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise ValueError(
            "Gemini API key not configured. Set it in Settings or in GEMINI_API_KEY env var."
        )
    return key


def _stream_gemini(messages, system_prompt, cfg, web_search_enabled=False, code_interpreter=False):
    import google.generativeai as genai

    genai.configure(api_key=_get_gemini_key(cfg))

    if not messages or messages[-1]["role"] != "user":
        raise ValueError("Last message must be from the user.")

    history = [{"role": m["role"], "parts": m["parts"]} for m in messages[:-1]]
    user_msg = messages[-1]["parts"][0]
    reasoning = cfg.get("reasoning", False)
    model_name = cfg["model"]

    use_native = reasoning and any(model_name.startswith(m) for m in _GEMINI_THINKING_MODELS)

    actual_prompt = system_prompt
    if not use_native and reasoning:
        actual_prompt = (
            (system_prompt + _cot_addendum()).strip() if system_prompt else _cot_addendum().strip()
        )

    fn_decls = []
    if web_search_enabled:
        fn_decls.append(
            genai.protos.FunctionDeclaration(
                name="web_search",
                description=(
                    "Search the web for current information. Use when the user asks about "
                    "recent events, current prices, live data, news, or anything that may "
                    "have changed after your training cutoff."
                ),
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        "query": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="The search query",
                        )
                    },
                    required=["query"],
                ),
            )
        )
        fn_decls.append(
            genai.protos.FunctionDeclaration(
                name="fetch_url",
                description=(
                    "Fetch and read the content of a specific URL. Use when the user "
                    "provides a link and wants to know what is on that page."
                ),
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        "url": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="The URL to fetch",
                        )
                    },
                    required=["url"],
                ),
            )
        )
    if code_interpreter:
        fn_decls.append(
            genai.protos.FunctionDeclaration(
                name="execute_code",
                description=(
                    "Execute code in an isolated Docker container and return stdout/stderr. "
                    "Supported languages: python, javascript, typescript, bash, ruby, php, perl, elixir, lua, c, cpp, java, go. "
                    "Java: class must be named Main."
                ),
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        "language": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="python, javascript, or bash",
                        ),
                        "code": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="The code to execute",
                        ),
                    },
                    required=["language", "code"],
                ),
            )
        )
    tools_list = [genai.protos.Tool(function_declarations=fn_decls)] if fn_decls else None

    def _make_model(with_thinking):
        gc = None
        if with_thinking:
            try:
                gc = genai.GenerationConfig(thinking_config={"thinking_budget": 8192})
            except Exception:
                with_thinking = False
        m = genai.GenerativeModel(
            model_name,
            system_instruction=actual_prompt or None,
            generation_config=gc,
            tools=tools_list,
        )
        return m, with_thinking

    model, use_native = _make_model(use_native)
    chat = model.start_chat(history=history)

    current_input = user_msg
    last_resp = None

    for step in range(MAX_AGENT_STEPS):
        if step == 0:
            try:
                resp = chat.send_message(current_input, stream=True)
                resp_iter = iter(resp)
                first = next(resp_iter, None)
            except Exception as e:
                if use_native and "thinking" in str(e).lower():
                    use_native = False
                    model, _ = _make_model(False)
                    chat = model.start_chat(history=history)
                    resp = chat.send_message(current_input, stream=True)
                    resp_iter = iter(resp)
                    first = next(resp_iter, None)
                else:
                    raise
            full_iter = itertools.chain([first] if first is not None else [], resp_iter)
        else:
            resp = chat.send_message(current_input, stream=True)
            full_iter = iter(resp)

        last_resp = resp
        fn_call = None

        if use_native:
            for chunk in full_iter:
                if not chunk.candidates:
                    continue
                for part in chunk.candidates[0].content.parts:
                    if hasattr(part, "function_call") and part.function_call.name:
                        fn_call = part.function_call
                    elif part.text:
                        if getattr(part, "thought", False):
                            yield {"thinking": part.text}
                        else:
                            yield part.text
        else:

            def _chunks():
                nonlocal fn_call
                for chunk in full_iter:
                    if not chunk.candidates:
                        continue
                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, "function_call") and part.function_call.name:
                            fn_call = part.function_call
                        elif part.text:
                            yield part.text

            if reasoning:
                yield from _parse_think_tags(_chunks())
            else:
                yield from _chunks()

        if fn_call is None:
            break

        events, result_text = _run_tool(fn_call.name, dict(fn_call.args))
        for event in events:
            yield event

        current_input = genai.protos.Part(
            function_response=genai.protos.FunctionResponse(
                name=fn_call.name,
                response={"result": result_text},
            )
        )

    if last_resp is not None:
        try:
            u = last_resp.usage_metadata
            yield {
                "usage": {
                    "prompt": u.prompt_token_count or 0,
                    "reply": u.candidates_token_count or 0,
                    "total": u.total_token_count or 0,
                }
            }
        except Exception:
            pass


def _generate_gemini(prompt, cfg):
    import google.generativeai as genai

    genai.configure(api_key=_get_gemini_key(cfg))
    model = genai.GenerativeModel(cfg["model"])
    return model.generate_content(prompt).text.strip()


# ---------------------------------------------------------------------------
# OpenAI-compatible  (OpenAI, Ollama, LM Studio, …)
# ---------------------------------------------------------------------------

# Models that reason internally — no separate thinking stream is exposed
_OPENAI_NATIVE_REASONING = ("o1", "o3", "o4", "o-")

# Ollama models that output <think>...</think> tags natively
_OLLAMA_THINK_TAG_MODELS = ("deepseek-r1", "qwq", "phi4-reasoning")


def _openai_client(cfg: dict):
    from openai import OpenAI

    key = cfg.get("api_key") or os.getenv("OPENAI_API_KEY", "ollama")
    kwargs: dict = {"api_key": key}
    if cfg.get("base_url"):
        kwargs["base_url"] = cfg["base_url"]
    return OpenAI(**kwargs)


def _stream_openai(messages, system_prompt, cfg, web_search_enabled=False, code_interpreter=False):
    client = _openai_client(cfg)
    reasoning = cfg.get("reasoning", False)
    model = cfg["model"]
    is_ollama = bool(cfg.get("base_url"))

    is_native_reasoning = not is_ollama and any(
        model.lower().startswith(p) for p in _OPENAI_NATIVE_REASONING
    )
    is_think_tag_model = is_ollama and any(
        model.lower().split(":")[0].startswith(p) for p in _OLLAMA_THINK_TAG_MODELS
    )

    # Ollama/LM Studio: inject tools into the system prompt — most local models lack native tool support
    use_prompt_tools = is_ollama and (web_search_enabled or code_interpreter)

    oai_messages: list[dict] = []
    if system_prompt:
        role = "developer" if is_native_reasoning else "system"
        oai_messages.append({"role": role, "content": system_prompt})

    if reasoning and not is_native_reasoning and not is_think_tag_model:
        cot = _cot_addendum()
        if oai_messages:
            oai_messages[0]["content"] += cot
        else:
            oai_messages.append({"role": "system", "content": cot.strip()})

    if use_prompt_tools:
        addendum = _build_tool_addendum(web_search_enabled, code_interpreter)
        if oai_messages:
            oai_messages[0]["content"] += addendum
        else:
            oai_messages.append({"role": "system", "content": addendum.strip()})

    oai_messages.extend(_to_openai_messages(messages))

    # Prompt-based path for Ollama (agent loop)
    if use_prompt_tools:
        current_messages = oai_messages
        for step in range(MAX_AGENT_STEPS):
            completion = client.chat.completions.create(
                model=model, messages=current_messages, stream=False
            )
            first_text = completion.choices[0].message.content or ""
            tool_call = _parse_prompt_tool_call(first_text)
            if not tool_call:
                if is_think_tag_model or (reasoning and not is_native_reasoning):
                    yield from _parse_think_tags(iter([first_text]))
                else:
                    yield first_text
                break
            events, result_text = _run_tool(tool_call.get("name", ""), tool_call.get("args", {}))
            for event in events:
                yield event
            current_messages = current_messages + [
                {
                    "role": "assistant",
                    "content": f"<tool_call>{json.dumps({'name': tool_call.get('name'), 'args': tool_call.get('args', {})})}</tool_call>",
                },
                {
                    "role": "user",
                    "content": f"Tool '{tool_call.get('name')}' returned:\n{result_text}\n\nNow continue or provide your final answer.",
                },
            ]
        return

    # Native tool-calling path (OpenAI cloud + reasoning models) with agent loop
    tools_param: list[dict] | None = None
    _oai_tools: list[dict] = []
    if web_search_enabled:
        _oai_tools += [
            {
                "type": "function",
                "function": {
                    "name": "web_search",
                    "description": (
                        "Search the web for current information. Use when the user asks about "
                        "recent events, current prices, live data, news, or anything that may "
                        "have changed after your training cutoff."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "The search query"}
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "fetch_url",
                    "description": (
                        "Fetch and read the content of a specific URL. Use when the user "
                        "provides a link and wants to know what is on that page."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string", "description": "The URL to fetch"}
                        },
                        "required": ["url"],
                    },
                },
            },
        ]
    if code_interpreter:
        _oai_tools.append(
            {
                "type": "function",
                "function": {
                    "name": "execute_code",
                    "description": (
                        "Execute code in a sandboxed subprocess and return stdout/stderr. "
                        "Supported languages: python, javascript, typescript, bash, ruby, php, perl, elixir, lua, c, cpp, java, go."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "language": {
                                "type": "string",
                                "description": "python, javascript, or bash",
                            },
                            "code": {"type": "string", "description": "The code to execute"},
                        },
                        "required": ["language", "code"],
                    },
                },
            }
        )
    if _oai_tools:
        tools_param = _oai_tools

    current_messages = oai_messages

    for step in range(MAX_AGENT_STEPS):
        create_kwargs: dict = {"model": model, "messages": current_messages, "stream": True}
        if tools_param:
            create_kwargs["tools"] = tools_param

        stream = client.chat.completions.create(**create_kwargs)
        tool_calls_buf: dict[int, dict] = {}

        def _text_gen():
            for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_buf:
                            tool_calls_buf[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc.id:
                            tool_calls_buf[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_buf[idx]["name"] += tc.function.name
                            if tc.function.arguments:
                                tool_calls_buf[idx]["arguments"] += tc.function.arguments

                if delta.content:
                    yield delta.content

                if choice.finish_reason == "tool_calls":
                    return

        if is_think_tag_model or (reasoning and not is_native_reasoning):
            yield from _parse_think_tags(_text_gen())
        else:
            yield from _text_gen()

        if not tool_calls_buf:
            break

        assistant_tool_calls = []
        result_messages = []

        for tc in tool_calls_buf.values():
            args = json.loads(tc["arguments"] or "{}")
            events, result_text = _run_tool(tc["name"], args)
            for event in events:
                yield event
            assistant_tool_calls.append(
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
            )
            result_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result_text,
                }
            )

        current_messages = current_messages + [
            {"role": "assistant", "content": None, "tool_calls": assistant_tool_calls},
            *result_messages,
        ]


def _generate_openai(prompt, cfg):
    client = _openai_client(cfg)
    resp = client.chat.completions.create(
        model=cfg["model"],
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------

# Only claude-3-7-sonnet supports the native extended thinking API parameter
_ANTHROPIC_NATIVE_THINKING = ("claude-3-7-sonnet",)


def _anthropic_client(cfg: dict):
    import anthropic

    key = cfg.get("api_key") or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("Anthropic API key not configured.")
    return anthropic.Anthropic(api_key=key)


def _stream_anthropic(
    messages, system_prompt, cfg, web_search_enabled=False, code_interpreter=False
):
    client = _anthropic_client(cfg)
    reasoning = cfg.get("reasoning", False)
    model = cfg["model"]

    use_native = reasoning and any(model.startswith(m) for m in _ANTHROPIC_NATIVE_THINKING)

    actual_system = system_prompt
    if not use_native and reasoning:
        actual_system = (
            (system_prompt + _cot_addendum()).strip() if system_prompt else _cot_addendum().strip()
        )

    kwargs: dict = {
        "model": model,
        "max_tokens": 16000 if use_native else 8096,
        "messages": _to_openai_messages(messages),
    }
    if actual_system:
        kwargs["system"] = actual_system
    if use_native:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 10000}

    _ant_tools: list[dict] = []
    if web_search_enabled:
        _ant_tools += [
            {
                "name": "web_search",
                "description": (
                    "Search the web for current information. Use when the user asks about "
                    "recent events, current prices, live data, news, or anything that may "
                    "have changed after your training cutoff."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "The search query"}},
                    "required": ["query"],
                },
            },
            {
                "name": "fetch_url",
                "description": (
                    "Fetch and read the content of a specific URL. Use when the user "
                    "provides a link and wants to know what is on that page."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {"url": {"type": "string", "description": "The URL to fetch"}},
                    "required": ["url"],
                },
            },
        ]
    if code_interpreter:
        _ant_tools.append(
            {
                "name": "execute_code",
                "description": (
                    "Execute code in an isolated Docker container and return stdout/stderr. "
                    "Supported languages: python, javascript, typescript, bash, ruby, php, perl, elixir, lua, c, cpp, java, go. "
                    "Java: class must be named Main."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "language": {
                            "type": "string",
                            "description": "python, javascript, or bash",
                        },
                        "code": {"type": "string", "description": "The code to execute"},
                    },
                    "required": ["language", "code"],
                },
            }
        )
    if _ant_tools:
        kwargs["tools"] = _ant_tools

    current_messages = list(kwargs["messages"])

    for step in range(MAX_AGENT_STEPS):
        loop_kwargs = {**kwargs, "messages": current_messages}

        tool_use_blocks: list[dict] = []
        current_tool: dict | None = None
        current_tool_input = ""

        with client.messages.stream(**loop_kwargs) as stream:
            if use_native:
                current_block_type = "text"
                for event in stream:
                    etype = getattr(event, "type", "")
                    if etype == "content_block_start":
                        block = event.content_block
                        current_block_type = getattr(block, "type", "text")
                        if current_block_type == "tool_use":
                            current_tool = {"id": block.id, "name": block.name}
                            current_tool_input = ""
                    elif etype == "content_block_delta":
                        delta = event.delta
                        dtype = getattr(delta, "type", "")
                        if dtype == "thinking_delta":
                            yield {"thinking": delta.thinking}
                        elif dtype == "text_delta" and current_block_type == "text":
                            yield delta.text
                        elif dtype == "input_json_delta" and current_block_type == "tool_use":
                            current_tool_input += delta.partial_json
                    elif etype == "content_block_stop" and current_tool is not None:
                        current_tool["input"] = current_tool_input
                        tool_use_blocks.append(current_tool)
                        current_tool = None
            else:
                current_block_type = "text"
                for event in stream:
                    etype = getattr(event, "type", "")
                    if etype == "content_block_start":
                        block = event.content_block
                        current_block_type = getattr(block, "type", "text")
                        if current_block_type == "tool_use":
                            current_tool = {"id": block.id, "name": block.name}
                            current_tool_input = ""
                    elif etype == "content_block_delta":
                        delta = event.delta
                        dtype = getattr(delta, "type", "")
                        if dtype == "text_delta" and current_block_type == "text":
                            yield delta.text
                        elif dtype == "input_json_delta" and current_block_type == "tool_use":
                            current_tool_input += delta.partial_json
                    elif etype == "content_block_stop" and current_tool is not None:
                        current_tool["input"] = current_tool_input
                        tool_use_blocks.append(current_tool)
                        current_tool = None

        if not tool_use_blocks:
            break

        assistant_content = []
        user_content = []

        for tb in tool_use_blocks:
            args = json.loads(tb["input"] or "{}")
            events, result_text = _run_tool(tb["name"], args)
            for event in events:
                yield event
            assistant_content.append(
                {"type": "tool_use", "id": tb["id"], "name": tb["name"], "input": args}
            )
            user_content.append(
                {"type": "tool_result", "tool_use_id": tb["id"], "content": result_text}
            )

        current_messages = current_messages + [
            {"role": "assistant", "content": assistant_content},
            {"role": "user", "content": user_content},
        ]


def _generate_anthropic(prompt, cfg):
    client = _anthropic_client(cfg)
    msg = client.messages.create(
        model=cfg["model"],
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()
