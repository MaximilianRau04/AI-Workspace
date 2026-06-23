import uuid
from datetime import datetime

from sqlalchemy.orm import joinedload

from db import get_session
from models.chat import ChatSession, Message
from schemas.chat import ChatSessionSchema, MessageSchema, SessionListItem

MAX_MESSAGES = 20
KEEP_AFTER_SUMMARY = 10


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _orm_to_schema(sess: ChatSession) -> ChatSessionSchema:
    return ChatSessionSchema(
        id=sess.id,
        user_id=sess.user_id,
        title=sess.title or "",
        summary=sess.summary or "",
        created_at=sess.created_at,
        updated_at=sess.updated_at,
        messages=[MessageSchema(role=m.role, parts=[m.content]) for m in sess.messages],
    )


# ---------------------------------------------------------------------------
# DB operations
# ---------------------------------------------------------------------------


def list_sessions(user_id: str) -> list[SessionListItem]:
    with get_session() as db:
        rows = (
            db.query(ChatSession)
            .filter(ChatSession.user_id == user_id)
            .order_by(ChatSession.pinned.desc(), ChatSession.updated_at.desc())
            .all()
        )
        return [
            SessionListItem(
                id=r.id,
                title=r.title or "",
                updated_at=r.updated_at,
                pinned=r.pinned,
                folder_id=r.folder_id,
            )
            for r in rows
        ]


def get_session_by_id(session_id: str, user_id: str) -> ChatSessionSchema | None:
    with get_session() as db:
        sess = (
            db.query(ChatSession)
            .options(joinedload(ChatSession.messages))
            .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
            .first()
        )
        return _orm_to_schema(sess) if sess else None


def create_session(user_id: str) -> ChatSessionSchema:
    now = _now_iso()
    sess = ChatSessionSchema(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title="",
        messages=[],
        summary="",
        created_at=now,
        updated_at=now,
    )
    # Not saved to DB here — save_session() is called on first message send
    return sess


def save_session(session: ChatSessionSchema, user_id: str) -> None:
    now = _now_iso()
    session.updated_at = now
    with get_session() as db:
        sess = db.query(ChatSession).filter(ChatSession.id == session.id).first()
        if sess:
            sess.title = session.title
            sess.summary = session.summary
            sess.updated_at = now
        else:
            sess = ChatSession(
                id=session.id,
                user_id=user_id,
                title=session.title,
                summary=session.summary,
                created_at=session.created_at,
                updated_at=now,
            )
            db.add(sess)
            db.flush()
        db.query(Message).filter(Message.session_id == session.id).delete()
        for i, msg in enumerate(session.messages):
            db.add(Message(session_id=session.id, role=msg.role, content=msg.parts[0], position=i))


def delete_session(session_id: str, user_id: str) -> None:
    with get_session() as db:
        db.query(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user_id
        ).delete()


def rename_session(session_id: str, user_id: str, title: str) -> None:
    with get_session() as db:
        sess = (
            db.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
            .first()
        )
        if sess:
            sess.title = title


# ---------------------------------------------------------------------------
# Conversation logic (pure, no DB)
# ---------------------------------------------------------------------------


def build_chat_messages(
    messages: list[MessageSchema], summary: str, user_message: str
) -> list[dict]:
    hist: list = []
    if summary:
        hist.append(
            {"role": "user", "parts": [f"Summary of our previous conversation:\n{summary}"]}
        )
        hist.append({"role": "model", "parts": ["Understood. I'll keep that context in mind."]})
    hist.extend({"role": m.role, "parts": m.parts} for m in messages)
    hist.append({"role": "user", "parts": [user_message]})
    return hist


def needs_summarization(messages: list[MessageSchema]) -> bool:
    return len(messages) > MAX_MESSAGES


def summarize_messages(messages: list[MessageSchema]) -> tuple[list[MessageSchema], str]:
    import llm

    to_summarize = messages[:-KEEP_AFTER_SUMMARY]
    keep = messages[-KEEP_AFTER_SUMMARY:]
    conversation_text = "\n".join(
        f"{'User' if m.role == 'user' else 'Assistant'}: {m.parts[0]}" for m in to_summarize
    )
    prompt = (
        "Summarize the following conversation concisely in 3-5 sentences. "
        "Focus on key topics, decisions, and context that would be useful to remember.\n\n"
        f"{conversation_text}"
    )
    return keep, llm.generate_text(prompt)


MEMORY_EXTRACTION_INTERVAL = 5  # extract every N user turns


def should_extract_memory(messages: list[MessageSchema]) -> bool:
    turn_count = sum(1 for m in messages if m.role == "user")
    return turn_count > 0 and turn_count % MEMORY_EXTRACTION_INTERVAL == 0


def extract_memory(messages: list[MessageSchema], current_memory: str) -> str:
    import llm

    conversation_text = "\n".join(
        f"{'User' if m.role == 'user' else 'Assistant'}: {m.parts[0][:500]}" for m in messages[-20:]
    )
    prompt = (
        f"Current memory about this user:\n{current_memory or '(none yet)'}\n\n"
        f"Recent conversation:\n{conversation_text}\n\n"
        "Extract any new facts, preferences, or context about the user from this conversation "
        "that would be useful to remember in future conversations — e.g. profession, interests, "
        "technical level, preferred language, ongoing projects, communication style. "
        "Update and expand the existing memory. Keep it under 150 words. "
        "If nothing new was learned, return the current memory unchanged. "
        "Return ONLY the updated memory text, no explanation."
    )
    return llm.generate_text(prompt).strip()
