"""Tests for conversation memory: rolling summary and tool results kept in history."""

import llm
from schemas.chat import ChatSessionSchema, MessageSchema
from services import chat as chat_service


def _pair(i: int, tool_calls: list[dict] | None = None) -> list[MessageSchema]:
    return [
        MessageSchema(role="user", parts=[f"question {i}"]),
        MessageSchema(role="model", parts=[f"answer {i}"], tool_calls=tool_calls or []),
    ]


def test_summarize_includes_previous_summary(monkeypatch):
    prompts = []
    monkeypatch.setattr(llm, "generate_text", lambda p: prompts.append(p) or " merged ")
    messages = [m for i in range(11) for m in _pair(i)]

    keep, summary = chat_service.summarize_messages(messages, "user is building a robot")

    assert summary == "merged"
    assert len(keep) == chat_service.KEEP_AFTER_SUMMARY
    assert "user is building a robot" in prompts[0]
    assert "question 0" in prompts[0]


def test_summarize_without_previous_summary(monkeypatch):
    prompts = []
    monkeypatch.setattr(llm, "generate_text", lambda p: prompts.append(p) or "first")
    messages = [m for i in range(11) for m in _pair(i)]

    _, summary = chat_service.summarize_messages(messages)

    assert summary == "first"
    assert "Running summary" not in prompts[0]


def test_tool_history_added_to_recent_replies_only():
    trace = [{"name": "web_search", "args": {"query": "weather"}, "result": "sunny, 21C"}]
    messages = [m for i in range(5) for m in _pair(i, trace)]

    hist = chat_service.build_chat_messages(messages, "", "next question")

    model_texts = [h["parts"][0] for h in hist if h["role"] == "model"]
    with_history = [t for t in model_texts if t.startswith("<tool_history>")]
    assert len(with_history) == chat_service.TOOL_HISTORY_TURNS
    assert model_texts[-1].startswith("<tool_history>")
    assert not model_texts[0].startswith("<tool_history>")
    assert 'web_search({"query": "weather"})' in model_texts[-1]
    assert "sunny, 21C" in model_texts[-1]
    assert model_texts[-1].endswith("answer 4")


def test_has_tool_history():
    trace = [{"name": "fetch_url", "args": {"url": "https://x.y"}, "result": "page"}]
    assert not chat_service.has_tool_history(_pair(0))
    assert chat_service.has_tool_history(_pair(0) + _pair(1, trace))


def test_run_tool_emits_truncated_trace(monkeypatch):
    long_result = "x" * (llm.TOOL_TRACE_MAX_CHARS + 500)
    monkeypatch.setattr(
        llm, "_dispatch_tool", lambda name, args: ([{"searching": "q"}], long_result)
    )

    events, result_text = llm._run_tool("web_search", {"query": "q"})

    assert result_text == long_result
    assert events[0] == {"searching": "q"}
    trace = events[-1]["tool_trace"]
    assert trace["name"] == "web_search"
    assert trace["args"] == {"query": "q"}
    assert trace["result"].endswith("[result truncated]")
    assert len(trace["result"]) < len(long_result)


def test_tool_calls_survive_save_and_load(authed_client):
    from db import get_session
    from models.user import User

    with get_session() as db:
        user_id = db.query(User).first().id

    sess = chat_service.create_session(user_id)
    trace = [{"name": "execute_code", "args": {"language": "python"}, "result": "42"}]
    sess.messages = _pair(0, trace)
    chat_service.save_session(sess, user_id)

    loaded = chat_service.get_session_by_id(sess.id, user_id)
    assert isinstance(loaded, ChatSessionSchema)
    assert loaded.messages[1].tool_calls == trace
    assert loaded.messages[0].tool_calls == []
