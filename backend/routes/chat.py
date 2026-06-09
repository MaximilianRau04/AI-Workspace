import json

from flask import Blueprint, Response, jsonify, request, session, stream_with_context

import history
import llm
import rag
import state
from utils import login_required

bp = Blueprint("chat", __name__)


def _parse_error(e: Exception) -> dict:
    msg = str(e)
    if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
        return {"type": "rate_limit", "title": "Rate limit reached", "detail": msg}
    if "401" in msg or "403" in msg or "api key" in msg.lower() or "API key" in msg:
        return {"type": "auth", "title": "Invalid API key", "detail": msg}
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


@bp.route("/chat", methods=["POST"])
@login_required
def chat_endpoint():
    user_id    = session["user_id"]
    user_state = state.get_or_init(user_id)

    data         = request.get_json()
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    attached_file = data.get("attached_file")
    pair_index    = data.get("pair_index")

    if pair_index is not None:
        # Editing: discard messages after the edited pair
        user_state["current_session"]["messages"] = (
            user_state["current_session"]["messages"][: pair_index * 2]
        )

    def generate():
        is_first = len(user_state["current_session"]["messages"]) == 0
        full_reply = ""

        context   = rag.retrieve(user_message, filename=attached_file)
        augmented = f"{context}\n\nUser: {user_message}" if context else user_message

        messages = history.build_chat_messages(
            user_state["current_session"]["messages"],
            user_state["current_session"].get("summary", ""),
            augmented,
        )

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

        user_state["current_session"]["messages"].append(
            {"role": "user",  "parts": [user_message]}
        )
        user_state["current_session"]["messages"].append(
            {"role": "model", "parts": [full_reply]}
        )

        if history.needs_summarization(user_state["current_session"]["messages"]):
            new_msgs, new_summary = history.summarize_messages(
                user_state["current_session"]["messages"]
            )
            user_state["current_session"]["messages"] = new_msgs
            user_state["current_session"]["summary"]  = new_summary

        history.save_session(user_state["current_session"], user_id)
        yield 'data: "[DONE]"\n\n'

        if is_first and full_reply:
            try:
                title = _generate_title(user_message, full_reply)
                user_state["current_session"]["title"] = title
                history.save_session(user_state["current_session"], user_id)
                yield (
                    f"event: title\ndata: "
                    f"{json.dumps({'id': user_state['current_session']['id'], 'title': title})}\n\n"
                )
            except Exception:
                pass

    return Response(stream_with_context(generate()), mimetype="text/event-stream")
