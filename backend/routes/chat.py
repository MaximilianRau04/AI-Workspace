import json
import re

from flask import Blueprint, Response, current_app, jsonify, request, session, stream_with_context

import history
import rag
import state
from utils import login_required

bp = Blueprint("chat", __name__)


def _parse_error(e: Exception) -> dict:
    msg = str(e)
    if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
        retry = None
        m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", msg)
        if m:
            retry = int(m.group(1))
        return {
            "type": "rate_limit",
            "title": "Rate limit reached",
            "detail": "You've hit the free tier limit for Gemini API requests.",
            "retry_after": retry,
        }
    if "401" in msg or "403" in msg or "API key" in msg.lower():
        return {"type": "auth", "title": "Invalid API key", "detail": "Check your GEMINI_API_KEY in .env."}
    return {"type": "generic", "title": "Something went wrong", "detail": msg}


def _generate_title(model, user_msg: str, bot_msg: str) -> str:
    prompt = (
        "Generate a very short title (max 5 words, no quotes, no punctuation at the end) "
        "for this conversation based on the first exchange. "
        "Use the same language as the conversation. Respond with only the title.\n\n"
        f"User: {user_msg[:300]}\n"
        f"Assistant: {bot_msg[:300]}"
    )
    response = model.generate_content(prompt)
    return response.text.strip().strip('"\'').strip()[:60]


@bp.route("/chat", methods=["POST"])
@login_required
def chat_endpoint():
    user_id = session["user_id"]
    model = current_app.config["model"]
    user_state = state.get_or_init(user_id, model)

    data = request.get_json()
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    attached_file = data.get("attached_file")
    pair_index = data.get("pair_index")

    if pair_index is not None:
        user_state["current_session"]["messages"] = user_state["current_session"]["messages"][:pair_index * 2]
        user_state["chat"] = model.start_chat(
            history=history.build_initial_history(
                user_state["current_session"]["messages"],
                user_state["current_session"]["summary"],
            )
        )

    def generate():
        is_first_message = len(user_state["current_session"]["messages"]) == 0
        full_reply = ""
        context = rag.retrieve(user_message, filename=attached_file)
        augmented = f"{context}\n\nUser: {user_message}" if context else user_message

        try:
            response = user_state["chat"].send_message(augmented, stream=True)
            for chunk in response:
                if chunk.text:
                    full_reply += chunk.text
                    yield f"data: {json.dumps(chunk.text)}\n\n"

            usage = response.usage_metadata
            yield f"event: usage\ndata: {json.dumps({
                'prompt':  usage.prompt_token_count,
                'reply':   usage.candidates_token_count,
                'total':   usage.total_token_count,
            })}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps(_parse_error(e))}\n\n"
            yield "data: \"[DONE]\"\n\n"
            return

        user_state["current_session"]["messages"].append({"role": "user", "parts": [user_message]})
        user_state["current_session"]["messages"].append({"role": "model", "parts": [full_reply]})

        if history.needs_summarization(user_state["current_session"]["messages"]):
            new_msgs, new_summary = history.summarize(user_state["current_session"]["messages"], model)
            user_state["current_session"]["messages"] = new_msgs
            user_state["current_session"]["summary"] = new_summary

        if is_first_message and full_reply:
            try:
                title = _generate_title(model, user_message, full_reply)
                user_state["current_session"]["title"] = title
                yield f"event: title\ndata: {json.dumps({'id': user_state['current_session']['id'], 'title': title})}\n\n"
            except Exception:
                pass

        history.save_session(user_state["current_session"], user_id)
        yield "data: \"[DONE]\"\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream")
