import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import iterate_in_threadpool

import llm
import rag
import state
from schemas.chat import MessageSchema
from services import chat as chat_service
from utils import login_required

router = APIRouter(tags=["chats"])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class ChatBody(BaseModel):
    message: str = ""
    attached_file: Optional[str] = None
    pair_index: Optional[int] = None


class RenameBody(BaseModel):
    title: str = ""


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

@router.get("/chats")
async def list_chats(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    user_state = state.get_or_init(user_id)
    return {
        "chats": chat_service.list_sessions(user_id),
        "current_id": user_state["current_session"].id,
    }


@router.post("/chats")
async def create_chat(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    new_sess = chat_service.create_session(user_id)
    state.set_state(user_id, {"current_session": new_sess})
    return {"id": new_sess.id}


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    sess = chat_service.get_session_by_id(chat_id, user_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Chat not found")
    state.set_state(user_id, {"current_session": sess})
    return {
        "id": sess.id,
        "title": sess.title or "",
        "messages": [m.model_dump() for m in sess.messages],
    }


@router.patch("/chats/{chat_id}")
async def rename_chat(
    chat_id: str,
    body: RenameBody,
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title required")
    chat_service.rename_session(chat_id, user_id, title)
    user_state = state.get_or_init(user_id)
    if user_state["current_session"].id == chat_id:
        user_state["current_session"].title = title
    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    user_state = state.get_or_init(user_id)
    chat_service.delete_session(chat_id, user_id)

    if user_state["current_session"].id == chat_id:
        remaining = chat_service.list_sessions(user_id)
        new_sess = (
            chat_service.get_session_by_id(remaining[0].id, user_id)
            if remaining
            else chat_service.create_session(user_id)
        )
        state.set_state(user_id, {"current_session": new_sess})

    return {"ok": True, "current_id": state.get_or_init(user_id)["current_session"].id}


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

def _parse_error(e: Exception) -> dict:
    import re
    msg = str(e)
    if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
        m = re.search(r'retry[^\d]*(\d+)', msg, re.IGNORECASE)
        retry_after = int(m.group(1)) if m else None
        err: dict = {"type": "rate_limit", "title": "Rate limit reached",
                     "detail": "You've hit the provider's rate limit."}
        if retry_after:
            err["retry_after"] = retry_after
        return err
    if "401" in msg or "403" in msg or "api key" in msg.lower() or "API key" in msg:
        return {"type": "auth", "title": "Invalid API key",
                "detail": "Check your API key in Settings."}
    return {"type": "generic", "title": "Something went wrong", "detail": msg}


def _generate_title(user_msg: str, bot_msg: str) -> str:
    prompt = (
        "Generate a very short title (max 5 words, no quotes, no punctuation at the end) "
        "for this conversation based on the first exchange. "
        "Use the same language as the conversation. Respond with only the title.\n\n"
        f"User: {user_msg[:300]}\n"
        f"Assistant: {bot_msg[:300]}"
    )
    return llm.generate_text(prompt).strip().strip('"\'').strip()[:60]


@router.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: str,
    body: ChatBody,
    current_user: dict = Depends(login_required),
):
    user_id = current_user["user_id"]
    user_state = state.get_or_init(user_id)

    if user_state["current_session"].id != chat_id:
        sess = chat_service.get_session_by_id(chat_id, user_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Chat not found")
        state.set_state(user_id, {"current_session": sess})
        user_state = state.get_or_init(user_id)

    sess = user_state["current_session"]
    user_message = body.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Empty message")

    if body.pair_index is not None:
        sess.messages = sess.messages[: body.pair_index * 2]

    def sync_generate():
        is_first = len(sess.messages) == 0
        full_reply = ""

        context = rag.retrieve(user_message, filename=body.attached_file)
        augmented = f"{context}\n\nUser: {user_message}" if context else user_message
        messages = chat_service.build_chat_messages(sess.messages, sess.summary, augmented)

        from routes.config import load_system_prompt
        system_prompt = load_system_prompt()

        try:
            for item in llm.stream_chat(messages, system_prompt):
                if isinstance(item, dict) and "usage" in item:
                    yield f"event: usage\ndata: {json.dumps(item['usage'])}\n\n"
                elif isinstance(item, dict) and "thinking" in item:
                    yield f"event: thinking\ndata: {json.dumps(item['thinking'])}\n\n"
                else:
                    full_reply += item
                    yield f"data: {json.dumps(item)}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps(_parse_error(e))}\n\n"
            yield 'data: "[DONE]"\n\n'
            return

        sess.messages.append(MessageSchema(role="user",  parts=[user_message]))
        sess.messages.append(MessageSchema(role="model", parts=[full_reply]))

        if chat_service.needs_summarization(sess.messages):
            sess.messages, sess.summary = chat_service.summarize_messages(sess.messages)

        if is_first and full_reply:
            try:
                title = _generate_title(user_message, full_reply)
                sess.title = title
                yield f"event: title\ndata: {json.dumps({'id': sess.id, 'title': title})}\n\n"
            except Exception:
                pass

        chat_service.save_session(sess, user_id)
        yield 'data: "[DONE]"\n\n'

    return StreamingResponse(
        iterate_in_threadpool(sync_generate()),
        media_type="text/event-stream",
    )
