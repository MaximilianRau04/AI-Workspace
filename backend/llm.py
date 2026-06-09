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
) -> Iterator[str | dict]:
    """
    Yield text chunks from the configured LLM.
    May yield {"thinking": str} chunks for reasoning content.
    The final item may be {"usage": {"prompt": N, "reply": N, "total": N}}.
    messages format: [{"role": "user"/"model", "parts": ["..."]}]
    """
    cfg = load_config()
    provider = cfg["provider"]
    if provider == "gemini":
        yield from _stream_gemini(messages, system_prompt, cfg)
    elif provider == "openai":
        yield from _stream_openai(messages, system_prompt, cfg)
    elif provider == "anthropic":
        yield from _stream_anthropic(messages, system_prompt, cfg)
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


def _stream_gemini(messages, system_prompt, cfg):
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

    def _make_model(with_thinking):
        gc = None
        if with_thinking:
            try:
                gc = genai.GenerationConfig(thinking_config={"thinking_budget": 8192})
            except Exception:
                with_thinking = False  # fall back, gc stays None
        m = genai.GenerativeModel(
            model_name,
            system_instruction=actual_prompt or None,
            generation_config=gc,
        )
        return m, with_thinking

    model, use_native = _make_model(use_native)
    chat = model.start_chat(history=history)
    try:
        resp = chat.send_message(user_msg, stream=True)
        # Force first chunk to trigger any immediate API error
        resp_iter = iter(resp)
        first = next(resp_iter, None)
    except Exception as e:
        if use_native and "thinking" in str(e).lower():
            # Retry without native thinking
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
        for chunk in full_iter:
            if not chunk.candidates:
                continue
            for part in chunk.candidates[0].content.parts:
                if not part.text:
                    continue
                if getattr(part, "thought", False):
                    yield {"thinking": part.text}
                else:
                    yield part.text
    else:
        def _chunks():
            for chunk in full_iter:
                if chunk.text:
                    yield chunk.text

        if reasoning:
            yield from _parse_think_tags(_chunks())
        else:
            yield from _chunks()

    u = resp.usage_metadata
    yield {"usage": {
        "prompt": u.prompt_token_count or 0,
        "reply":  u.candidates_token_count or 0,
        "total":  u.total_token_count or 0,
    }}


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


def _stream_openai(messages, system_prompt, cfg):
    client    = _openai_client(cfg)
    reasoning = cfg.get("reasoning", False)
    model     = cfg["model"]
    is_ollama = bool(cfg.get("base_url"))

    # OpenAI o-series: reasoning is built-in, not exposed in the text stream
    is_native_reasoning = not is_ollama and any(
        model.lower().startswith(p) for p in _OPENAI_NATIVE_REASONING
    )
    # Ollama models that always output <think> tags regardless of the reasoning flag
    is_think_tag_model = is_ollama and any(
        model.lower().split(":")[0].startswith(p) for p in _OLLAMA_THINK_TAG_MODELS
    )

    oai_messages: list[dict] = []
    if system_prompt:
        # o-series uses "developer" role; everything else uses "system"
        role = "developer" if is_native_reasoning else "system"
        oai_messages.append({"role": role, "content": system_prompt})

    if reasoning and not is_native_reasoning and not is_think_tag_model:
        cot = _cot_addendum()
        if oai_messages:
            oai_messages[0]["content"] += cot
        else:
            oai_messages.append({"role": "system", "content": cot.strip()})

    oai_messages.extend(_to_openai_messages(messages))

    stream = client.chat.completions.create(
        model=model,
        messages=oai_messages,
        stream=True,
    )

    def _text_gen():
        for chunk in stream:
            if chunk.choices:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

    if is_think_tag_model or (reasoning and not is_native_reasoning):
        yield from _parse_think_tags(_text_gen())
    else:
        yield from _text_gen()


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


def _stream_anthropic(messages, system_prompt, cfg):
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

    with client.messages.stream(**kwargs) as stream:
        if use_native:
            current_block_type = "text"
            for event in stream:
                etype = getattr(event, "type", "")
                if etype == "content_block_start":
                    current_block_type = getattr(event.content_block, "type", "text")
                elif etype == "content_block_delta":
                    delta = event.delta
                    dtype = getattr(delta, "type", "")
                    if dtype == "thinking_delta":
                        yield {"thinking": delta.thinking}
                    elif dtype == "text_delta":
                        yield delta.text
        else:
            if reasoning:
                yield from _parse_think_tags(stream.text_stream)
            else:
                for text in stream.text_stream:
                    yield text


def _generate_anthropic(prompt, cfg):
    client = _anthropic_client(cfg)
    msg = client.messages.create(
        model=cfg["model"],
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()
