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
    "provider":  "gemini",
    "model":     "gemini-2.5-flash",
    "api_key":   "",
    "base_url":  "",
    "reasoning": False,
    "presets":   [],
}


# ---------------------------------------------------------------------------
# Prompt-based tool dispatch (fallback for models without native tool calling)
# ---------------------------------------------------------------------------

_TOOL_SYSTEM_ADDENDUM = """

You have access to the following tools. When you need to use one, respond with ONLY this JSON block and nothing else before or after it:
<tool_call>{"name": "<tool_name>", "args": {<args_json>}}</tool_call>

Available tools:
- web_search: Search the web for current information. Args: {"query": "your search query"}
- fetch_url: Fetch and read the content of a URL. Args: {"url": "https://example.com"}

Only use a tool when the question requires real-time or external information. Otherwise answer normally."""


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
) -> Iterator[str | dict]:
    """
    Yield text chunks from the configured LLM.
    May yield {"thinking": str} chunks for reasoning content.
    May yield {"searching": str} when a web_search tool call is in progress.
    The final item may be {"usage": {"prompt": N, "reply": N, "total": N}}.
    messages format: [{"role": "user"/"model", "parts": ["..."]}]
    """
    cfg = load_config()
    provider = cfg["provider"]
    if provider == "gemini":
        yield from _stream_gemini(messages, system_prompt, cfg, web_search)
    elif provider == "openai":
        yield from _stream_openai(messages, system_prompt, cfg, web_search)
    elif provider == "anthropic":
        yield from _stream_anthropic(messages, system_prompt, cfg, web_search)
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
    import urllib.request, urllib.error
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
    TAG_OPEN  = "<think>"
    TAG_CLOSE = "</think>"
    in_think  = False
    buf       = ""

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
                        buf = buf[len(safe):]
                    break
                if idx > 0:
                    yield buf[:idx]
                buf      = buf[idx + len(TAG_OPEN):]
                in_think = True
            else:
                idx = buf.find(TAG_CLOSE)
                if idx == -1:
                    safe = buf[: max(0, len(buf) - len(TAG_CLOSE))]
                    if safe:
                        yield {"thinking": safe}
                        buf = buf[len(safe):]
                    break
                if idx > 0:
                    yield {"thinking": buf[:idx]}
                buf      = buf[idx + len(TAG_CLOSE):]
                in_think = False

    if buf:
        yield {"thinking": buf} if in_think else buf


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

_GEMINI_THINKING_MODELS = ("gemini-2.5-flash", "gemini-2.5-pro")


def _get_gemini_key(cfg: dict) -> str:
    key = cfg.get("api_key") or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise ValueError("Gemini API key not configured. Set it in Settings or in GEMINI_API_KEY env var.")
    return key


def _stream_gemini(messages, system_prompt, cfg, web_search_enabled=False):
    import google.generativeai as genai
    genai.configure(api_key=_get_gemini_key(cfg))

    if not messages or messages[-1]["role"] != "user":
        raise ValueError("Last message must be from the user.")

    history    = [{"role": m["role"], "parts": m["parts"]} for m in messages[:-1]]
    user_msg   = messages[-1]["parts"][0]
    reasoning  = cfg.get("reasoning", False)
    model_name = cfg["model"]

    use_native = reasoning and any(model_name.startswith(m) for m in _GEMINI_THINKING_MODELS)

    actual_prompt = system_prompt
    if not use_native and reasoning:
        actual_prompt = (system_prompt + _cot_addendum()).strip() if system_prompt else _cot_addendum().strip()

    tools_list = None
    if web_search_enabled:
        search_decl = genai.protos.FunctionDeclaration(
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
        fetch_decl = genai.protos.FunctionDeclaration(
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
        tools_list = [genai.protos.Tool(function_declarations=[search_decl, fetch_decl])]

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
    try:
        resp = chat.send_message(user_msg, stream=True)
        resp_iter = iter(resp)
        first = next(resp_iter, None)
    except Exception as e:
        if use_native and "thinking" in str(e).lower():
            use_native = False
            model, _ = _make_model(False)
            chat = model.start_chat(history=history)
            resp = chat.send_message(user_msg, stream=True)
            resp_iter = iter(resp)
            first = next(resp_iter, None)
        else:
            raise

    full_iter = itertools.chain([first] if first is not None else [], resp_iter)

    if use_native:
        fn_call = None
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
        if fn_call:
            yield from _gemini_execute_tool(chat, fn_call)
    else:
        fn_call = None

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

        if fn_call:
            yield from _gemini_execute_tool(chat, fn_call)
            return

    try:
        u = resp.usage_metadata
        yield {"usage": {
            "prompt": u.prompt_token_count or 0,
            "reply":  u.candidates_token_count or 0,
            "total":  u.total_token_count or 0,
        }}
    except Exception:
        pass


def _gemini_execute_tool(chat, fn_call):
    import google.generativeai as genai
    from tools import web_search, format_results, fetch_url

    args = dict(fn_call.args)
    if fn_call.name == "web_search":
        query = args.get("query", "")
        yield {"searching": query}
        result_text = format_results(web_search(query))
    elif fn_call.name == "fetch_url":
        url = args.get("url", "")
        yield {"searching": url}
        result_text = fetch_url(url)
    else:
        return

    resp2 = chat.send_message(
        genai.protos.Part(
            function_response=genai.protos.FunctionResponse(
                name=fn_call.name,
                response={"result": result_text},
            )
        ),
        stream=True,
    )
    for chunk in resp2:
        if chunk.candidates:
            for part in chunk.candidates[0].content.parts:
                if part.text:
                    yield part.text


def _generate_gemini(prompt, cfg):
    import google.generativeai as genai
    genai.configure(api_key=_get_gemini_key(cfg))
    model = genai.GenerativeModel(cfg["model"])
    return model.generate_content(prompt).text.strip()


# ---------------------------------------------------------------------------
# Prompt-based tool executor (used by Ollama / providers without native tools)
# ---------------------------------------------------------------------------

def _prompt_execute_tool(client, model: str, oai_messages: list[dict], tool_call: dict,
                          reasoning: bool, is_think_tag: bool):
    from tools import web_search, format_results, fetch_url

    name = tool_call.get("name", "")
    args = tool_call.get("args", {})

    if name == "web_search":
        query = args.get("query", "")
        yield {"searching": query}
        result_text = format_results(web_search(query))
    elif name == "fetch_url":
        url = args.get("url", "")
        yield {"searching": url}
        result_text = fetch_url(url)
    else:
        return

    follow_up = oai_messages + [
        {"role": "assistant", "content": f'<tool_call>{json.dumps({"name": name, "args": args})}</tool_call>'},
        {"role": "user",      "content": f"Tool '{name}' returned:\n{result_text}\n\nNow provide your final answer."},
    ]
    stream2 = client.chat.completions.create(model=model, messages=follow_up, stream=True)

    def _gen():
        for chunk in stream2:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    if is_think_tag or reasoning:
        yield from _parse_think_tags(_gen())
    else:
        yield from _gen()


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


def _stream_openai(messages, system_prompt, cfg, web_search_enabled=False):
    client    = _openai_client(cfg)
    reasoning = cfg.get("reasoning", False)
    model     = cfg["model"]
    is_ollama = bool(cfg.get("base_url"))

    is_native_reasoning = not is_ollama and any(
        model.lower().startswith(p) for p in _OPENAI_NATIVE_REASONING
    )
    is_think_tag_model = is_ollama and any(
        model.lower().split(":")[0].startswith(p) for p in _OLLAMA_THINK_TAG_MODELS
    )

    # Ollama/LM Studio: inject tools into the system prompt — most local models lack native tool support
    use_prompt_tools = is_ollama and web_search_enabled

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
        if oai_messages:
            oai_messages[0]["content"] += _TOOL_SYSTEM_ADDENDUM
        else:
            oai_messages.append({"role": "system", "content": _TOOL_SYSTEM_ADDENDUM.strip()})

    oai_messages.extend(_to_openai_messages(messages))

    # Prompt-based path for Ollama
    if use_prompt_tools:
        completion = client.chat.completions.create(model=model, messages=oai_messages, stream=False)
        first_text = completion.choices[0].message.content or ""
        tool_call  = _parse_prompt_tool_call(first_text)
        if tool_call:
            yield from _prompt_execute_tool(client, model, oai_messages, tool_call, reasoning, is_think_tag_model)
        else:
            if is_think_tag_model or (reasoning and not is_native_reasoning):
                yield from _parse_think_tags(iter([first_text]))
            else:
                yield first_text
        return

    # Native tool-calling path (OpenAI cloud + reasoning models)
    tools_param: list[dict] | None = None
    if web_search_enabled:
        tools_param = [
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

    create_kwargs: dict = {"model": model, "messages": oai_messages, "stream": True}
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

    if tool_calls_buf:
        yield from _openai_execute_tools(client, model, oai_messages, tool_calls_buf)


def _openai_execute_tools(client, model, oai_messages, tool_calls_buf):
    import json
    from tools import web_search, format_results, fetch_url

    result_messages: list[dict] = []
    assistant_tool_calls = []

    for tc in tool_calls_buf.values():
        args = json.loads(tc["arguments"] or "{}")
        if tc["name"] == "web_search":
            query = args.get("query", "")
            yield {"searching": query}
            result_text = format_results(web_search(query))
        elif tc["name"] == "fetch_url":
            url = args.get("url", "")
            yield {"searching": url}
            result_text = fetch_url(url)
        else:
            continue

        assistant_tool_calls.append({
            "id": tc["id"],
            "type": "function",
            "function": {"name": tc["name"], "arguments": tc["arguments"]},
        })
        result_messages.append({
            "role": "tool",
            "tool_call_id": tc["id"],
            "content": result_text,
        })

    if not assistant_tool_calls:
        return

    new_messages = oai_messages + [
        {"role": "assistant", "content": None, "tool_calls": assistant_tool_calls},
        *result_messages,
    ]
    stream2 = client.chat.completions.create(model=model, messages=new_messages, stream=True)
    for chunk in stream2:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


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


def _stream_anthropic(messages, system_prompt, cfg, web_search_enabled=False):
    client    = _anthropic_client(cfg)
    reasoning = cfg.get("reasoning", False)
    model     = cfg["model"]

    use_native = reasoning and any(model.startswith(m) for m in _ANTHROPIC_NATIVE_THINKING)

    actual_system = system_prompt
    if not use_native and reasoning:
        actual_system = (system_prompt + _cot_addendum()).strip() if system_prompt else _cot_addendum().strip()

    kwargs: dict = {
        "model":      model,
        "max_tokens": 16000 if use_native else 8096,
        "messages":   _to_openai_messages(messages),
    }
    if actual_system:
        kwargs["system"] = actual_system
    if use_native:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 10000}
    if web_search_enabled:
        kwargs["tools"] = [
            {
                "name": "web_search",
                "description": (
                    "Search the web for current information. Use when the user asks about "
                    "recent events, current prices, live data, news, or anything that may "
                    "have changed after your training cutoff."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The search query"}
                    },
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
                    "properties": {
                        "url": {"type": "string", "description": "The URL to fetch"}
                    },
                    "required": ["url"],
                },
            },
        ]

    tool_use_blocks: list[dict] = []
    current_tool: dict | None = None
    current_tool_input = ""

    with client.messages.stream(**kwargs) as stream:
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

    if tool_use_blocks:
        yield from _anthropic_execute_tools(client, kwargs, tool_use_blocks)


def _anthropic_execute_tools(client, original_kwargs, tool_use_blocks):
    import json
    from tools import web_search, format_results, fetch_url

    assistant_content = []
    user_content = []

    for tb in tool_use_blocks:
        args = json.loads(tb["input"] or "{}")
        if tb["name"] == "web_search":
            query = args.get("query", "")
            yield {"searching": query}
            result_text = format_results(web_search(query))
        elif tb["name"] == "fetch_url":
            url = args.get("url", "")
            yield {"searching": url}
            result_text = fetch_url(url)
        else:
            continue

        assistant_content.append({"type": "tool_use", "id": tb["id"], "name": tb["name"], "input": args})
        user_content.append({"type": "tool_result", "tool_use_id": tb["id"], "content": result_text})

    if not assistant_content:
        return

    new_messages = list(original_kwargs["messages"]) + [
        {"role": "assistant", "content": assistant_content},
        {"role": "user",      "content": user_content},
    ]
    kwargs2 = {k: v for k, v in original_kwargs.items() if k != "tools"}
    kwargs2["messages"] = new_messages
    kwargs2["max_tokens"] = 8096

    with client.messages.stream(**kwargs2) as stream2:
        for text in stream2.text_stream:
            yield text


def _generate_anthropic(prompt, cfg):
    client = _anthropic_client(cfg)
    msg = client.messages.create(
        model=cfg["model"],
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()
