"""Agent loop behaviour per provider, with fake SDK clients (no network)."""

import json
from types import SimpleNamespace as ns

import pytest

import llm

USER_MSG = [{"role": "user", "parts": ["hi"]}]


@pytest.fixture
def tool_calls(monkeypatch):
    calls = []

    def fake_dispatch(name, args):
        calls.append((name, dict(args)))
        return [{"searching": args.get("query", "")}], "tool says 42"

    monkeypatch.setattr(llm, "_dispatch_tool", fake_dispatch)
    return calls


def _use_config(monkeypatch, **cfg):
    monkeypatch.setattr(llm, "load_config", lambda: {**llm.DEFAULTS, "api_key": "k", **cfg})


def _split(out):
    text = "".join(x for x in out if isinstance(x, str))
    thinking = "".join(x["thinking"] for x in out if isinstance(x, dict) and "thinking" in x)
    events = [x for x in out if isinstance(x, dict) and "thinking" not in x]
    return text, thinking, events


def _usage(events):
    return next((e["usage"] for e in events if "usage" in e), None)


# --- Anthropic --------------------------------------------------------------


class FakeAnthropicStream:
    def __init__(self, events):
        self.events = events

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        return iter(self.events)

    def get_final_message(self):
        return ns(usage=ns(input_tokens=10, output_tokens=5))


class FakeAnthropic:
    def __init__(self, turns):
        self.turns = list(turns)
        self.requests = []
        self.messages = self

    def stream(self, **kwargs):
        self.requests.append(kwargs)
        return FakeAnthropicStream(self.turns.pop(0))


def a_text(text):
    return [
        ns(type="content_block_start", content_block=ns(type="text")),
        ns(type="content_block_delta", delta=ns(type="text_delta", text=text)),
        ns(type="content_block_stop"),
    ]


def a_tool(tool_id, name, args):
    return [
        ns(type="content_block_start", content_block=ns(type="tool_use", id=tool_id, name=name)),
        ns(
            type="content_block_delta",
            delta=ns(type="input_json_delta", partial_json=json.dumps(args)),
        ),
        ns(type="content_block_stop"),
    ]


def test_anthropic_tool_call_then_answer(monkeypatch, tool_calls):
    _use_config(monkeypatch, provider="anthropic", model="claude-sonnet-4-6")
    client = FakeAnthropic([a_tool("t1", "web_search", {"query": "q"}), a_text("Answer")])
    monkeypatch.setattr(llm, "_anthropic_client", lambda cfg: client)

    text, _, events = _split(list(llm.stream_chat(USER_MSG, web_search=True)))

    assert text == "Answer"
    assert tool_calls == [("web_search", {"query": "q"})]
    assert {"searching": "q"} in events
    trace = next(e["tool_trace"] for e in events if "tool_trace" in e)
    assert trace == {"name": "web_search", "args": {"query": "q"}, "result": "tool says 42"}
    assert _usage(events) == {"prompt": 20, "reply": 10, "total": 30}

    assert [t["name"] for t in client.requests[0]["tools"]] == ["web_search", "fetch_url"]
    follow_up = client.requests[1]["messages"]
    assert follow_up[-2]["content"][0]["id"] == "t1"
    assert follow_up[-1]["content"][0] == {
        "type": "tool_result",
        "tool_use_id": "t1",
        "content": "tool says 42",
    }


def test_anthropic_without_tools_sends_no_tools(monkeypatch, tool_calls):
    _use_config(monkeypatch, provider="anthropic", model="claude-sonnet-4-6")
    client = FakeAnthropic([a_text("Hello")])
    monkeypatch.setattr(llm, "_anthropic_client", lambda cfg: client)

    text, _, _ = _split(list(llm.stream_chat(USER_MSG, system_prompt="be nice")))

    assert text == "Hello"
    assert "tools" not in client.requests[0]
    assert client.requests[0]["system"] == "be nice"
    assert tool_calls == []


def test_agent_loop_stops_at_step_limit(monkeypatch, tool_calls):
    _use_config(monkeypatch, provider="anthropic", model="claude-sonnet-4-6")
    turns = [a_tool(f"t{i}", "web_search", {"query": str(i)}) for i in range(50)]
    client = FakeAnthropic(turns)
    monkeypatch.setattr(llm, "_anthropic_client", lambda cfg: client)

    list(llm.stream_chat(USER_MSG, web_search=True))

    assert len(client.requests) == llm.MAX_AGENT_STEPS
    assert len(tool_calls) == llm.MAX_AGENT_STEPS


# --- OpenAI-compatible ------------------------------------------------------


class FakeOpenAI:
    def __init__(self, turns):
        self.turns = list(turns)
        self.requests = []
        self.chat = ns(completions=self)

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return self.turns.pop(0)


def o_chunk(content=None, tool_calls=None, finish=None, usage=None):
    choices = (
        []
        if usage
        else [ns(delta=ns(content=content, tool_calls=tool_calls), finish_reason=finish)]
    )
    return ns(usage=usage, choices=choices)


def o_text(text):
    return [
        o_chunk(content=text, finish="stop"),
        o_chunk(usage=ns(prompt_tokens=7, completion_tokens=3)),
    ]


def o_tool(call_id, name, args):
    tc = ns(index=0, id=call_id, function=ns(name=name, arguments=json.dumps(args)))
    return [o_chunk(tool_calls=[tc], finish="tool_calls")]


def test_openai_native_tool_call_then_answer(monkeypatch, tool_calls):
    _use_config(monkeypatch, provider="openai", model="gpt-4o")
    client = FakeOpenAI([o_tool("c1", "web_search", {"query": "q"}), o_text("Answer")])
    monkeypatch.setattr(llm, "_openai_client", lambda cfg: client)

    text, _, events = _split(list(llm.stream_chat(USER_MSG, web_search=True)))

    assert text == "Answer"
    assert tool_calls == [("web_search", {"query": "q"})]
    assert any("tool_trace" in e for e in events)
    assert _usage(events) == {"prompt": 7, "reply": 3, "total": 10}
    follow_up = client.requests[1]["messages"]
    assert follow_up[-2]["tool_calls"][0]["id"] == "c1"
    assert follow_up[-1] == {"role": "tool", "tool_call_id": "c1", "content": "tool says 42"}


def test_openai_reasoning_parses_think_tags(monkeypatch, tool_calls):
    _use_config(monkeypatch, provider="openai", model="gpt-4o", reasoning=True)
    client = FakeOpenAI([o_text("<think>hmm</think>Answer")])
    monkeypatch.setattr(llm, "_openai_client", lambda cfg: client)

    text, thinking, _ = _split(list(llm.stream_chat(USER_MSG)))

    assert text == "Answer"
    assert thinking == "hmm"


def test_ollama_prompt_based_tool_call(monkeypatch, tool_calls):
    _use_config(
        monkeypatch, provider="openai", model="qwen3:8b", base_url="http://localhost:11434/v1"
    )

    def completion(content):
        return ns(
            usage=ns(prompt_tokens=1, completion_tokens=1),
            choices=[ns(message=ns(content=content))],
        )

    call = '<tool_call>{"name": "web_search", "args": {"query": "q"}}</tool_call>'
    client = FakeOpenAI([completion(call), completion("Answer")])
    monkeypatch.setattr(llm, "_openai_client", lambda cfg: client)

    text, _, events = _split(list(llm.stream_chat(USER_MSG, web_search=True)))

    assert text == "Answer"
    assert tool_calls == [("web_search", {"query": "q"})]
    assert "tools" not in client.requests[0]
    assert "<tool_call>" in client.requests[0]["messages"][0]["content"]
    assert "tool says 42" in client.requests[1]["messages"][-1]["content"]
    assert _usage(events) == {"prompt": 2, "reply": 2, "total": 4}


# --- Gemini -----------------------------------------------------------------


class FakeGeminiResponse:
    def __init__(self, parts):
        self.chunks = [ns(candidates=[ns(content=ns(parts=parts))])]
        self.usage_metadata = ns(prompt_token_count=4, candidates_token_count=2)

    def __iter__(self):
        return iter(self.chunks)


def test_gemini_tool_call_then_answer(monkeypatch, tool_calls):
    import google.generativeai as genai

    _use_config(monkeypatch, provider="gemini", model="gemini-2.5-flash")
    sent = []
    turns = [
        [ns(function_call=ns(name="web_search", args={"query": "q"}), text="")],
        [ns(function_call=ns(name=""), text="Answer")],
    ]

    class FakeChat:
        def send_message(self, content, stream=False):
            sent.append(content)
            return FakeGeminiResponse(turns.pop(0))

    class FakeModel:
        def __init__(self, *args, tools=None, **kwargs):
            self.tools = tools

        def start_chat(self, history):
            return FakeChat()

    monkeypatch.setattr(genai, "configure", lambda **kw: None)
    monkeypatch.setattr(genai, "GenerativeModel", FakeModel)

    text, _, events = _split(list(llm.stream_chat(USER_MSG, web_search=True)))

    assert text == "Answer"
    assert tool_calls == [("web_search", {"query": "q"})]
    assert sent[1].function_response.name == "web_search"
    assert _usage(events) == {"prompt": 8, "reply": 4, "total": 12}
