import json
import os
import uuid
from datetime import datetime

LEGACY_HISTORY_FILE = os.path.join(os.path.dirname(__file__), "..", "chat_history.json")
CHATS_DIR = os.path.join(os.path.dirname(__file__), "..", "chats")

MAX_MESSAGES = 20
KEEP_AFTER_SUMMARY = 10


def _session_path(session_id: str) -> str:
    return os.path.join(CHATS_DIR, f"{session_id}.json")


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def migrate_legacy() -> None:
    """Migrate chat_history.json to chats/ directory if it exists."""
    if not os.path.exists(LEGACY_HISTORY_FILE):
        return
    os.makedirs(CHATS_DIR, exist_ok=True)
    if os.listdir(CHATS_DIR):
        return  # already migrated
    with open(LEGACY_HISTORY_FILE) as f:
        data = json.load(f)
    messages = data.get("messages", [])
    summary = data.get("summary", "")
    if not messages and not summary:
        return
    session = {
        "id": str(uuid.uuid4()),
        "title": "Vorheriges Gespräch",
        "messages": messages,
        "summary": summary,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    with open(_session_path(session["id"]), "w") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)


def list_sessions() -> list:
    """Return all sessions sorted by updated_at descending."""
    os.makedirs(CHATS_DIR, exist_ok=True)
    sessions = []
    for fname in os.listdir(CHATS_DIR):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(CHATS_DIR, fname)) as f:
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


def load_session(session_id: str) -> dict | None:
    path = _session_path(session_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def save_session(session: dict) -> None:
    os.makedirs(CHATS_DIR, exist_ok=True)
    session["updated_at"] = _now_iso()
    with open(_session_path(session["id"]), "w") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)


def create_session() -> dict:
    os.makedirs(CHATS_DIR, exist_ok=True)
    now = _now_iso()
    session = {
        "id": str(uuid.uuid4()),
        "title": "",
        "messages": [],
        "summary": "",
        "created_at": now,
        "updated_at": now,
    }
    save_session(session)
    return session


def delete_session(session_id: str) -> None:
    path = _session_path(session_id)
    if os.path.exists(path):
        os.remove(path)


def build_initial_history(messages: list, summary: str) -> list:
    """Build history list for Gemini, prepending summary if present."""
    history = []
    if summary:
        history.append({"role": "user", "parts": [
            f"Here is a summary of our previous conversation:\n{summary}"
        ]})
        history.append({"role": "model", "parts": [
            "Understood. I'll keep that context in mind."
        ]})
    history.extend(messages)
    return history


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
