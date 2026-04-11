import os

import google.generativeai as genai
from flask import Blueprint, current_app, jsonify, request, session

import state
from utils import login_required

SYSTEM_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "system_prompt.txt")

bp = Blueprint("config", __name__)


def load_system_prompt() -> str:
    if not os.path.exists(SYSTEM_PROMPT_FILE):
        return ""
    with open(SYSTEM_PROMPT_FILE, encoding="utf-8") as f:
        return f.read().strip()


@bp.route("/config", methods=["GET"])
@login_required
def get_config():
    return jsonify({"system_prompt": load_system_prompt()})


@bp.route("/config", methods=["POST"])
@login_required
def set_config():
    data = request.get_json()
    new_prompt = data.get("system_prompt", "").strip()

    with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
        f.write(new_prompt)

    new_model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=new_prompt or None,
    )
    current_app.config["model"] = new_model

    # Rebuild the current user's chat with updated model
    user_id = session["user_id"]
    import history
    user_state = state.get_or_init(user_id, new_model)
    user_state["chat"] = new_model.start_chat(
        history=history.build_initial_history(
            user_state["current_session"]["messages"],
            user_state["current_session"]["summary"],
        )
    )

    return jsonify({"ok": True})
