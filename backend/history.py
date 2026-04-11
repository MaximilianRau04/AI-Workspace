import json
import os
import uuid
from datetime import datetime

CHATS_BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "chats")

MAX_MESSAGES = 20
KEEP_AFTER_SUMMARY = 10


def _chats_dir(user_id: str) -> str:
    return os.path.join(CHATS_BASE_DIR, user_id)


def _session_path(session_id: str, user_id: str) -> str:
    return os.path.join(_chats_dir(user_id), f"{session_id}.json")


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def list_sessions(user_id: str) -> list:
    """Return all sessions for a user, sorted by updated_at descending."""
    d = _chats_dir(user_id)
    os.makedirs(d, exist_ok=True)
    sessions = []
    for fname in os.listdir(d):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fname), encoding="utf-8") as f:
                data = json.load(f)
            sessions.append({
                "id": data["id"],
                "title": data.get("title") or "",
                "updated_at": data.get("updated_at", ""),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    sessions.sort(key=lambda s: s["updated_at"], reverse=True)
    return sessions


def load_session(session_id: str, user_id: str) -> dict | None:
    path = _session_path(session_id, user_id)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_session(session: dict, user_id: str) -> None:
    d = _chats_dir(user_id)
    os.makedirs(d, exist_ok=True)
    session["updated_at"] = _now_iso()
    with open(_session_path(session["id"], user_id), "w", encoding="utf-8") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)


def create_session(user_id: str) -> dict:
    d = _chats_dir(user_id)
    os.makedirs(d, exist_ok=True)
    now = _now_iso()
    session = {
        "id": str(uuid.uuid4()),
        "title": "",
        "messages": [],
        "summary": "",
        "created_at": now,
        "updated_at": now,
    }
    save_session(session, user_id)
    return session


def delete_session(session_id: str, user_id: str) -> None:
    path = _session_path(session_id, user_id)
    if os.path.exists(path):
        os.remove(path)


def build_initial_history(messages: list, summary: str) -> list:
    """Build history list for Gemini, prepending summary if present."""
    hist = []
    if summary:
        hist.append({"role": "user", "parts": [
            f"Here is a summary of our previous conversation:\n{summary}"
        ]})
        hist.append({"role": "model", "parts": [
            "Understood. I'll keep that context in mind."
        ]})
    hist.extend(messages)
    return hist


def needs_summarization(messages: list) -> bool:
    return len(messages) > MAX_MESSAGES


def summarize(messages: list, model) -> tuple[list, str]:
    """Summarize the oldest messages and return (remaining_messages, new_summary)."""
    to_summarize = messages[:-KEEP_AFTER_SUMMARY]
    keep = messages[-KEEP_AFTER_SUMMARY:]

    conversation_text = "\n".join(
        f"{m['role'].capitalize()}: {m['parts'][0]}" for m in to_summarize
    )
    prompt = (
        "Summarize the following conversation concisely in 3-5 sentences. "
        "Focus on key topics, decisions, and context that would be useful to remember.\n\n"
        f"{conversation_text}"
    )
    response = model.generate_content(prompt)
    return keep, response.text
