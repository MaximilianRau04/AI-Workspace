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
            .order_by(ChatSession.updated_at.desc())
            .all()
        )
        return [SessionListItem(id=r.id, title=r.title or "", updated_at=r.updated_at) for r in rows]


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
    save_session(sess, user_id)
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
        sess = db.query(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == user_id
        ).first()
        if sess:
            sess.title = title


# ---------------------------------------------------------------------------
# Conversation logic (pure, no DB)
# ---------------------------------------------------------------------------

def build_chat_messages(messages: list[MessageSchema], summary: str, user_message: str) -> list[dict]:
    hist: list = []
    if summary:
        hist.append({"role": "user",  "parts": [f"Summary of our previous conversation:\n{summary}"]})
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
        f"{'User' if m.role == 'user' else 'Assistant'}: {m.parts[0]}"
        for m in to_summarize
    )
    prompt = (
        "Summarize the following conversation concisely in 3-5 sentences. "
        "Focus on key topics, decisions, and context that would be useful to remember.\n\n"
        f"{conversation_text}"
    )
    return keep, llm.generate_text(prompt)
