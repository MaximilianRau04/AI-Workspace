"""
Provider-agnostic LLM abstraction.

Internally uses Gemini-format messages throughout:
  [{"role": "user"/"model", "parts": ["content"]}, ...]

stream_chat() yields str chunks, {"thinking": str} for reasoning content,
tool events ({"searching"}, {"executing"}, {"code_result"}, {"tool_trace"}),
and as the final item may yield a {"usage": {...}} dict.
"""

from __future__ import annotations

import base64
import itertools
import json
import os
import re
from dataclasses import dataclass, field
from typing import Callable, Iterator

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "model_config.json")

DEFAULTS: dict = {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key": "",
    "base_url": "",
    "reasoning": False,
    "presets": [],
    "stt_backend": "google",
    "tts_voice": "de-DE-ConradNeural",
    "tts_rate": "+0%",
    # Keyed "provider::model" -> {"input": $/1M input tokens, "output": $/1M output tokens}.
    # Left empty by default — filled in by the user in Settings, since prices vary and change.
    "pricing": {},
}

MAX_AGENT_STEPS = 10
TOOL_TRACE_MAX_CHARS = 2000  # per tool result kept in the chat history


# ---------------------------------------------------------------------------
# Prompt-based tool dispatch (fallback for models without native tool calling)
# ---------------------------------------------------------------------------


def _build_tool_addendum(
    web_search: bool, code_interpreter: bool, mcp_tools: list[dict] | None = None
) -> str:
    if not web_search and not code_interpreter and not mcp_tools:
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
            '- execute_code: Execute code. Args: {"language": "python|javascript|typescript|bash|ruby|php|perl|elixir|lua|c|cpp|java|go|rust|csharp", "code": "your code"}'
        )
    for tool in mcp_tools or []:
        lines.append(
            f"- {tool['name']}: {tool['description']} Args (JSON schema): {json.dumps(tool['input_schema'])}"
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
    mcp_servers: list[str] | None = None,
) -> Iterator[str | dict]:
    """
    Yield text chunks from the configured LLM.
    May yield {"thinking": str} chunks for reasoning content.
    May yield {"searching": str} when a web_search tool call is in progress.
    May yield {"executing": {"language": str, "code": str}} before code execution.
    May yield {"code_result": {"language": str, "code": str, "stdout": str, "stderr": str, "exit_code": int}}.
    The final item may be {"usage": {"prompt": N, "reply": N, "total": N}}.
    messages format: [{"role": "user"/"model", "parts": ["..."]}]
    mcp_servers: IDs of enabled MCP servers whose tools should be offered to the model.
    """
    cfg = load_config()
    provider = cfg["provider"]
    mcp_servers = mcp_servers or []
    if provider == "gemini":
        yield from _stream_gemini(
            messages, system_prompt, cfg, web_search, code_interpreter, mcp_servers
        )
    elif provider == "openai":
        yield from _stream_openai(
            messages, system_prompt, cfg, web_search, code_interpreter, mcp_servers
        )
    elif provider == "anthropic":
        yield from _stream_anthropic(
            messages, system_prompt, cfg, web_search, code_interpreter, mcp_servers
        )
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


def _split_data_url(data_url: str) -> tuple[str, str]:
    """'data:image/png;base64,AAAA...' -> ('image/png', 'AAAA...')"""
    header, _, data = data_url.partition(",")
    m = re.match(r"data:([^;]+);base64", header)
    return (m.group(1) if m else "image/png"), data


def _to_openai_messages(messages: list[dict]) -> list[dict]:
    result = []
    for m in messages:
        role = "assistant" if m["role"] in ("model", "assistant") else m["role"]
        text = m["parts"][0]
        images = m.get("images") or []
        if images:
            content: list | str = [{"type": "text", "text": text}] if text else []
            content += [{"type": "image_url", "image_url": {"url": url}} for url in images]
        else:
            content = text
        result.append({"role": role, "content": content})
    return result


def _to_anthropic_messages(messages: list[dict]) -> list[dict]:
    result = []
    for m in messages:
        role = "assistant" if m["role"] in ("model", "assistant") else m["role"]
        text = m["parts"][0]
        images = m.get("images") or []
        if images:
            content: list = []
            for url in images:
                mime, data = _split_data_url(url)
                content.append(
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": mime, "data": data},
                    }
                )
            if text:
                content.append({"type": "text", "text": text})
        else:
            content = text
        result.append({"role": role, "content": content})
    return result


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
    """Execute a tool call. Returns (events_to_yield, result_text).

    The events end with a {"tool_trace": ...} item so the caller can store the call
    and a truncated result in the chat history.
    """
    events, result_text = _dispatch_tool(name, args)
    # Gemini args can hold proto containers; round-trip so the trace is plain JSON
    trace_args = json.loads(json.dumps(args, default=str))
    trace = {"name": name, "args": trace_args, "result": result_text}
    if len(result_text) > TOOL_TRACE_MAX_CHARS:
        trace["result"] = result_text[:TOOL_TRACE_MAX_CHARS] + "\n[result truncated]"
    return [*events, {"tool_trace": trace}], result_text


def _dispatch_tool(name: str, args: dict) -> tuple[list[dict], str]:
    from tools import execute_code, fetch_url, format_code_result, format_results, web_search

    if name.startswith("mcp__"):
        from mcp_manager import manager as mcp_manager

        short_name = name.split("__", 2)[-1]
        label = f"{short_name}({', '.join(f'{k}={v}' for k, v in args.items())})"
        return [{"searching": label}], mcp_manager.call_tool_sync(name, args)
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
# Shared agent loop
# ---------------------------------------------------------------------------

_CODE_LANGS = "python, javascript, typescript, bash, ruby, php, perl, elixir, lua, c, cpp, java, go, rust, csharp"


def _tool_specs(
    web_search: bool, code_interpreter: bool, mcp_servers: list[str] | None
) -> list[dict]:
    """Provider-neutral tool definitions: [{name, description, input_schema}]."""
    specs: list[dict] = []
    if web_search:
        specs += [
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
        specs.append(
            {
                "name": "execute_code",
                "description": (
                    "Execute code in an isolated Docker container and return stdout/stderr. "
                    f"Supported languages: {_CODE_LANGS}. "
                    "Java: class must be named Main. C#: uses Mono (class-based programs)."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "language": {"type": "string", "description": _CODE_LANGS},
                        "code": {"type": "string", "description": "The code to execute"},
                    },
                    "required": ["language", "code"],
                },
            }
        )
    if mcp_servers:
        from mcp_manager import manager as mcp_manager

        specs += [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["input_schema"],
            }
            for t in mcp_manager.list_tools_cached(mcp_servers)
        ]
    return specs


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict
    raw_args: str = ""


@dataclass
class StepResult:
    """Filled in by a provider step while it streams one model turn."""

    tool_calls: list[ToolCall] = field(default_factory=list)
    prompt_tokens: int = 0
    reply_tokens: int = 0


def _agent_loop(
    step: Callable[[StepResult], Iterator[str | dict]],
    add_results: Callable[[list[tuple[ToolCall, str]]], None],
) -> Iterator[str | dict]:
    """Run model turns until no tool is called or MAX_AGENT_STEPS is reached.

    step streams one turn (text/thinking) and records tool calls and token usage;
    add_results feeds the tool outputs back into the provider's conversation.
    """
    total_prompt = total_reply = 0
    for _ in range(MAX_AGENT_STEPS):
        result = StepResult()
        yield from step(result)
        total_prompt += result.prompt_tokens
        total_reply += result.reply_tokens
        if not result.tool_calls:
            break
        outputs = []
        for call in result.tool_calls:
            events, result_text = _run_tool(call.name, call.args)
            yield from events
            outputs.append((call, result_text))
        add_results(outputs)
    if total_prompt or total_reply:
        yield {
            "usage": {
                "prompt": total_prompt,
                "reply": total_reply,
                "total": total_prompt + total_reply,
            }
        }


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


def _json_schema_to_gemini_schema(genai, schema: dict):
    """Convert a plain JSON-Schema dict (as returned by MCP tools) into a genai.protos.Schema."""
    type_map = {
        "string": genai.protos.Type.STRING,
        "number": genai.protos.Type.NUMBER,
        "integer": genai.protos.Type.INTEGER,
        "boolean": genai.protos.Type.BOOLEAN,
        "array": genai.protos.Type.ARRAY,
        "object": genai.protos.Type.OBJECT,
    }
    json_type = schema.get("type", "string")
    if isinstance(json_type, list):
        json_type = next((t for t in json_type if t != "null"), "string")
    gemini_type = type_map.get(json_type, genai.protos.Type.STRING)

    kwargs: dict = {"type": gemini_type}
    if schema.get("description"):
        kwargs["description"] = schema["description"]
    if schema.get("enum"):
        kwargs["enum"] = [str(v) for v in schema["enum"]]
    if gemini_type == genai.protos.Type.OBJECT:
        props = schema.get("properties") or {}
        if props:
            kwargs["properties"] = {
                k: _json_schema_to_gemini_schema(genai, v) for k, v in props.items()
            }
        if schema.get("required"):
            kwargs["required"] = schema["required"]
    elif gemini_type == genai.protos.Type.ARRAY:
        items = schema.get("items")
        kwargs["items"] = (
            _json_schema_to_gemini_schema(genai, items)
            if isinstance(items, dict)
            else genai.protos.Schema(type=genai.protos.Type.STRING)
        )
    return genai.protos.Schema(**kwargs)


def _gemini_parts(m: dict) -> list:
    parts: list = []
    text = m["parts"][0]
    if text:
        parts.append(text)
    for data_url in m.get("images") or []:
        mime, data = _split_data_url(data_url)
        parts.append({"mime_type": mime, "data": base64.b64decode(data)})
    return parts or [""]


def _stream_gemini(
    messages,
    system_prompt,
    cfg,
    web_search_enabled=False,
    code_interpreter=False,
    mcp_servers: list[str] | None = None,
):
    import google.generativeai as genai

    genai.configure(api_key=_get_gemini_key(cfg))

    if not messages or messages[-1]["role"] != "user":
        raise ValueError("Last message must be from the user.")

    history = [{"role": m["role"], "parts": _gemini_parts(m)} for m in messages[:-1]]
    reasoning = cfg.get("reasoning", False)
    model_name = cfg["model"]

    use_native = reasoning and any(model_name.startswith(m) for m in _GEMINI_THINKING_MODELS)

    actual_prompt = system_prompt
    if not use_native and reasoning:
        actual_prompt = (
            (system_prompt + _cot_addendum()).strip() if system_prompt else _cot_addendum().strip()
        )

    fn_decls = [
        genai.protos.FunctionDeclaration(
            name=t["name"],
            description=t["description"],
            parameters=_json_schema_to_gemini_schema(genai, t["input_schema"]),
        )
        for t in _tool_specs(web_search_enabled, code_interpreter, mcp_servers)
    ]
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
    loop = {
        "chat": model.start_chat(history=history),
        "input": _gemini_parts(messages[-1]),
        "native": use_native,
        "first": True,
    }

    def _send():
        if not loop["first"]:
            resp = loop["chat"].send_message(loop["input"], stream=True)
            return resp, iter(resp)
        loop["first"] = False
        try:
            resp = loop["chat"].send_message(loop["input"], stream=True)
            resp_iter = iter(resp)
            first = next(resp_iter, None)
        except Exception as e:
            if not (loop["native"] and "thinking" in str(e).lower()):
                raise
            # Model rejected the thinking config: retry once without it.
            loop["native"] = False
            fallback, _ = _make_model(False)
            loop["chat"] = fallback.start_chat(history=history)
            resp = loop["chat"].send_message(loop["input"], stream=True)
            resp_iter = iter(resp)
            first = next(resp_iter, None)
        return resp, itertools.chain([first] if first is not None else [], resp_iter)

    def step(result: StepResult):
        resp, full_iter = _send()
        native = loop["native"]

        def parts():
            for chunk in full_iter:
                if not chunk.candidates:
                    continue
                for part in chunk.candidates[0].content.parts:
                    if hasattr(part, "function_call") and part.function_call.name:
                        fc = part.function_call
                        result.tool_calls.append(ToolCall(id="", name=fc.name, args=dict(fc.args)))
                    elif part.text:
                        if native and getattr(part, "thought", False):
                            yield {"thinking": part.text}
                        else:
                            yield part.text

        if reasoning and not native:
            yield from _parse_think_tags(parts())
        else:
            yield from parts()

        try:
            u = resp.usage_metadata
            result.prompt_tokens = u.prompt_token_count or 0
            result.reply_tokens = u.candidates_token_count or 0
        except Exception:
            pass

    def add_results(outputs: list[tuple[ToolCall, str]]) -> None:
        responses = [
            genai.protos.Part(
                function_response=genai.protos.FunctionResponse(
                    name=c.name, response={"result": text}
                )
            )
            for c, text in outputs
        ]
        loop["input"] = responses[0] if len(responses) == 1 else responses

    yield from _agent_loop(step, add_results)


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


def _stream_openai(
    messages,
    system_prompt,
    cfg,
    web_search_enabled=False,
    code_interpreter=False,
    mcp_servers: list[str] | None = None,
):
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

    mcp_tools: list[dict] = []
    if mcp_servers:
        from mcp_manager import manager as mcp_manager

        mcp_tools = mcp_manager.list_tools_cached(mcp_servers)

    # Ollama/LM Studio: inject tools into the system prompt — most local models lack native tool support
    use_prompt_tools = is_ollama and (web_search_enabled or code_interpreter or mcp_tools)

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
        addendum = _build_tool_addendum(web_search_enabled, code_interpreter, mcp_tools)
        if oai_messages:
            oai_messages[0]["content"] += addendum
        else:
            oai_messages.append({"role": "system", "content": addendum.strip()})

    oai_messages.extend(_to_openai_messages(messages))

    parse_think = is_think_tag_model or (reasoning and not is_native_reasoning)
    current_messages = list(oai_messages)

    # Prompt-based path for Ollama/LM Studio: tool calls are parsed from <tool_call> tags
    if use_prompt_tools:

        def prompt_step(result: StepResult):
            completion = client.chat.completions.create(
                model=model, messages=list(current_messages), stream=False
            )
            if completion.usage:
                result.prompt_tokens = completion.usage.prompt_tokens or 0
                result.reply_tokens = completion.usage.completion_tokens or 0
            text = completion.choices[0].message.content or ""
            call = _parse_prompt_tool_call(text)
            if call:
                result.tool_calls.append(
                    ToolCall(id="", name=call.get("name", ""), args=call.get("args", {}))
                )
            elif parse_think:
                yield from _parse_think_tags(iter([text]))
            else:
                yield text

        def prompt_add_results(outputs: list[tuple[ToolCall, str]]) -> None:
            for c, text in outputs:
                payload = json.dumps({"name": c.name, "args": c.args})
                current_messages.append(
                    {"role": "assistant", "content": f"<tool_call>{payload}</tool_call>"}
                )
                current_messages.append(
                    {
                        "role": "user",
                        "content": f"Tool '{c.name}' returned:\n{text}\n\n"
                        "Now continue or provide your final answer.",
                    }
                )

        yield from _agent_loop(prompt_step, prompt_add_results)
        return

    # Native tool-calling path (OpenAI cloud + reasoning models)
    tools_param = [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in _tool_specs(web_search_enabled, code_interpreter, mcp_servers)
    ]

    def step(result: StepResult):
        create_kwargs: dict = {"model": model, "messages": list(current_messages), "stream": True}
        if tools_param:
            create_kwargs["tools"] = tools_param
        if not is_ollama:
            create_kwargs["stream_options"] = {"include_usage": True}
        stream = client.chat.completions.create(**create_kwargs)
        buf: dict[int, dict] = {}

        def text_gen():
            for chunk in stream:
                if getattr(chunk, "usage", None):
                    result.prompt_tokens = chunk.usage.prompt_tokens or 0
                    result.reply_tokens = chunk.usage.completion_tokens or 0
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta
                for tc in delta.tool_calls or []:
                    entry = buf.setdefault(tc.index, {"id": "", "name": "", "arguments": ""})
                    if tc.id:
                        entry["id"] = tc.id
                    if tc.function:
                        entry["name"] += tc.function.name or ""
                        entry["arguments"] += tc.function.arguments or ""
                if delta.content:
                    yield delta.content
                if choice.finish_reason == "tool_calls":
                    return

        yield from _parse_think_tags(text_gen()) if parse_think else text_gen()
        for tc in buf.values():
            result.tool_calls.append(
                ToolCall(
                    id=tc["id"],
                    name=tc["name"],
                    args=json.loads(tc["arguments"] or "{}"),
                    raw_args=tc["arguments"],
                )
            )

    def add_results(outputs: list[tuple[ToolCall, str]]) -> None:
        current_messages.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": c.id,
                        "type": "function",
                        "function": {"name": c.name, "arguments": c.raw_args},
                    }
                    for c, _ in outputs
                ],
            }
        )
        current_messages.extend(
            {"role": "tool", "tool_call_id": c.id, "content": text} for c, text in outputs
        )

    yield from _agent_loop(step, add_results)


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
    messages,
    system_prompt,
    cfg,
    web_search_enabled=False,
    code_interpreter=False,
    mcp_servers: list[str] | None = None,
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
        "messages": _to_anthropic_messages(messages),
    }
    if actual_system:
        kwargs["system"] = actual_system
    if use_native:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 10000}

    tools = _tool_specs(web_search_enabled, code_interpreter, mcp_servers)
    if tools:
        kwargs["tools"] = tools
    current_messages = list(kwargs["messages"])

    def step(result: StepResult):
        current_tool: dict | None = None
        current_tool_input = ""
        current_block_type = "text"
        with client.messages.stream(**{**kwargs, "messages": list(current_messages)}) as stream:
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
                    if dtype == "thinking_delta" and use_native:
                        yield {"thinking": delta.thinking}
                    elif dtype == "text_delta" and current_block_type == "text":
                        yield delta.text
                    elif dtype == "input_json_delta" and current_block_type == "tool_use":
                        current_tool_input += delta.partial_json
                elif etype == "content_block_stop" and current_tool is not None:
                    result.tool_calls.append(
                        ToolCall(
                            id=current_tool["id"],
                            name=current_tool["name"],
                            args=json.loads(current_tool_input or "{}"),
                        )
                    )
                    current_tool = None

            final_msg = stream.get_final_message()
            result.prompt_tokens = final_msg.usage.input_tokens or 0
            result.reply_tokens = final_msg.usage.output_tokens or 0

    def add_results(outputs: list[tuple[ToolCall, str]]) -> None:
        current_messages.append(
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": c.id, "name": c.name, "input": c.args}
                    for c, _ in outputs
                ],
            }
        )
        current_messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": c.id, "content": text}
                    for c, text in outputs
                ],
            }
        )

    yield from _agent_loop(step, add_results)


def _generate_anthropic(prompt, cfg):
    client = _anthropic_client(cfg)
    msg = client.messages.create(
        model=cfg["model"],
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()
