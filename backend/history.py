import uuid
from datetime import datetime

import db

MAX_MESSAGES    = 20
KEEP_AFTER_SUMMARY = 10


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _load_messages(conn, session_id: str) -> list:
    rows = conn.execute(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY position",
        (session_id,),
    ).fetchall()
    return [{"role": r["role"], "parts": [r["content"]]} for r in rows]


def _row_to_session(row, messages: list) -> dict:
    return {
        "id":         row["id"],
        "user_id":    row["user_id"],
        "title":      row["title"] or "",
        "summary":    row["summary"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "messages":   messages,
    }


def list_sessions(user_id: str) -> list:
    with db.get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, updated_at FROM sessions"
            " WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    return [{"id": r["id"], "title": r["title"] or "", "updated_at": r["updated_at"]}
            for r in rows]


def load_session(session_id: str, user_id: str) -> dict | None:
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        if not row:
            return None
        messages = _load_messages(conn, session_id)
    return _row_to_session(row, messages)


def save_session(session: dict, user_id: str) -> None:
    now = _now_iso()
    session["updated_at"] = now
    created_at = session.get("created_at", now)

    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO sessions (id, user_id, title, summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title      = excluded.title,
                summary    = excluded.summary,
                updated_at = excluded.updated_at
            """,
            (session["id"], user_id, session.get("title", ""),
             session.get("summary", ""), created_at, now),
        )
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session["id"],))
        for i, msg in enumerate(session.get("messages", [])):
            conn.execute(
                "INSERT INTO messages (session_id, role, content, position) VALUES (?, ?, ?, ?)",
                (session["id"], msg["role"], msg["parts"][0], i),
            )


def create_session(user_id: str) -> dict:
    now = _now_iso()
    session = {
        "id":         str(uuid.uuid4()),
        "user_id":    user_id,
        "title":      "",
        "messages":   [],
        "summary":    "",
        "created_at": now,
        "updated_at": now,
    }
    save_session(session, user_id)
    return session


def delete_session(session_id: str, user_id: str) -> None:
    with db.get_conn() as conn:
        conn.execute(
            "DELETE FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        )


# ---------------------------------------------------------------------------
# Message building
# ---------------------------------------------------------------------------

def build_chat_messages(messages: list, summary: str, user_message: str) -> list:
    """
    Build the full message list to send to the LLM for one turn.
    Prepends a summary context pair when a summary exists, then appends
    the new user message at the end.
    Format: [{"role": "user"/"model", "parts": ["..."]}]
    """
    hist: list = []
    if summary:
        hist.append({"role": "user",  "parts": [f"Summary of our previous conversation:\n{summary}"]})
        hist.append({"role": "model", "parts": ["Understood. I'll keep that context in mind."]})
    hist.extend(messages)
    hist.append({"role": "user", "parts": [user_message]})
    return hist


# ---------------------------------------------------------------------------
# Summarization
# ---------------------------------------------------------------------------

def needs_summarization(messages: list) -> bool:
    return len(messages) > MAX_MESSAGES


def summarize_messages(messages: list) -> tuple[list, str]:
    """Summarize the oldest messages; return (remaining_messages, new_summary)."""
    import llm  # imported here to avoid circular imports at module load
    to_summarize = messages[:-KEEP_AFTER_SUMMARY]
    keep         = messages[-KEEP_AFTER_SUMMARY:]

    conversation_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['parts'][0]}"
        for m in to_summarize
    )
    prompt = (
        "Summarize the following conversation concisely in 3-5 sentences. "
        "Focus on key topics, decisions, and context that would be useful to remember.\n\n"
        f"{conversation_text}"
    )
    summary = llm.generate_text(prompt)
    return keep, summary
