from flask import Blueprint, current_app, jsonify, session

import history
import state
from utils import login_required

bp = Blueprint("sessions", __name__)


@bp.route("/sessions", methods=["GET"])
@login_required
def get_sessions():
    user_id = session["user_id"]
    model = current_app.config["model"]
    user_state = state.get_or_init(user_id, model)
    return jsonify({
        "sessions": history.list_sessions(user_id),
        "current_id": user_state["current_session"]["id"],
    })


@bp.route("/sessions/new", methods=["POST"])
@login_required
def new_session():
    user_id = session["user_id"]
    model = current_app.config["model"]
    new_sess = history.create_session(user_id)
    chat = model.start_chat(history=[])
    state.set_state(user_id, {"current_session": new_sess, "chat": chat})
    return jsonify({"id": new_sess["id"]})


@bp.route("/sessions/<session_id>", methods=["GET"])
@login_required
def load_session_route(session_id):
    user_id = session["user_id"]
    model = current_app.config["model"]
    sess = history.load_session(session_id, user_id)
    if not sess:
        return jsonify({"error": "Session not found"}), 404
    chat = model.start_chat(
        history=history.build_initial_history(sess["messages"], sess["summary"])
    )
    state.set_state(user_id, {"current_session": sess, "chat": chat})
    return jsonify({
        "id": sess["id"],
        "title": sess.get("title") or "",
        "messages": sess["messages"],
    })


@bp.route("/sessions/<session_id>", methods=["DELETE"])
@login_required
def delete_session_route(session_id):
    user_id = session["user_id"]
    model = current_app.config["model"]
    history.delete_session(session_id, user_id)
    user_state = state.get_or_init(user_id, model)
    if user_state["current_session"]["id"] == session_id:
        remaining = history.list_sessions(user_id)
        if remaining:
            new_sess = history.load_session(remaining[0]["id"], user_id)
        else:
            new_sess = history.create_session(user_id)
        chat = model.start_chat(
            history=history.build_initial_history(new_sess["messages"], new_sess["summary"])
        )
        state.set_state(user_id, {"current_session": new_sess, "chat": chat})
    return jsonify({
        "ok": True,
        "current_id": state.get_or_init(user_id, model)["current_session"]["id"],
    })
