from flask import Blueprint, jsonify, session

import history
import state
from utils import login_required

bp = Blueprint("sessions", __name__)


@bp.route("/sessions", methods=["GET"])
@login_required
def get_sessions():
    user_id    = session["user_id"]
    user_state = state.get_or_init(user_id)
    return jsonify({
        "sessions":   history.list_sessions(user_id),
        "current_id": user_state["current_session"]["id"],
    })


@bp.route("/sessions/new", methods=["POST"])
@login_required
def new_session():
    user_id  = session["user_id"]
    new_sess = history.create_session(user_id)
    state.set_state(user_id, {"current_session": new_sess})
    return jsonify({"id": new_sess["id"]})


@bp.route("/sessions/<session_id>", methods=["GET"])
@login_required
def load_session_route(session_id):
    user_id = session["user_id"]
    sess    = history.load_session(session_id, user_id)
    if not sess:
        return jsonify({"error": "Session not found"}), 404
    state.set_state(user_id, {"current_session": sess})
    return jsonify({
        "id":       sess["id"],
        "title":    sess.get("title") or "",
        "messages": sess["messages"],
    })


@bp.route("/sessions/<session_id>", methods=["DELETE"])
@login_required
def delete_session_route(session_id):
    user_id    = session["user_id"]
    user_state = state.get_or_init(user_id)
    history.delete_session(session_id, user_id)

    if user_state["current_session"]["id"] == session_id:
        remaining = history.list_sessions(user_id)
        new_sess  = (
            history.load_session(remaining[0]["id"], user_id)
            if remaining
            else history.create_session(user_id)
        )
        state.set_state(user_id, {"current_session": new_sess})

    current_id = state.get_or_init(user_id)["current_session"]["id"]
    return jsonify({"ok": True, "current_id": current_id})
