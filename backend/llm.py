"""
Provider-agnostic LLM abstraction.

Internally uses Gemini-format messages throughout:
  [{"role": "user"/"model", "parts": ["content"]}, ...]

stream_chat() yields str chunks, and as the final item may yield
a {"usage": {...}} dict (currently only Gemini emits this).
"""
from __future__ import annotations

import json
import os
from typing import Iterator

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "model_config.json")

DEFAULTS: dict = {
    "provider": "gemini",
    "model":    "gemini-2.5-flash",
    "api_key":  "",
    "base_url": "",
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
    The final yielded item may be a dict {"usage": {"prompt": N, "reply": N, "total": N}}.
    messages format: [{"role": "user"/"model", "parts": ["..."]}]
    Raises on API/config errors.
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
    # strip /v1 suffix if present – Ollama's tag list is at the root API
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


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

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

    history = [{"role": m["role"], "parts": m["parts"]} for m in messages[:-1]]
    user_msg = messages[-1]["parts"][0]

    model = genai.GenerativeModel(cfg["model"], system_instruction=system_prompt or None)
    chat  = model.start_chat(history=history)
    resp  = chat.send_message(user_msg, stream=True)

    for chunk in resp:
        if chunk.text:
            yield chunk.text

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

def _openai_client(cfg: dict):
    from openai import OpenAI
    key = cfg.get("api_key") or os.getenv("OPENAI_API_KEY", "ollama")
    kwargs: dict = {"api_key": key}
    if cfg.get("base_url"):
        kwargs["base_url"] = cfg["base_url"]
    return OpenAI(**kwargs)


def _stream_openai(messages, system_prompt, cfg):
    client = _openai_client(cfg)
    oai_messages = []
    if system_prompt:
        oai_messages.append({"role": "system", "content": system_prompt})
    oai_messages.extend(_to_openai_messages(messages))

    stream = client.chat.completions.create(
        model=cfg["model"],
        messages=oai_messages,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


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

def _anthropic_client(cfg: dict):
    import anthropic
    key = cfg.get("api_key") or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("Anthropic API key not configured.")
    return anthropic.Anthropic(api_key=key)


def _stream_anthropic(messages, system_prompt, cfg):
    client = _anthropic_client(cfg)
    kwargs: dict = {
        "model":      cfg["model"],
        "max_tokens": 8096,
        "messages":   _to_openai_messages(messages),
    }
    if system_prompt:
        kwargs["system"] = system_prompt

    with client.messages.stream(**kwargs) as stream:
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
