"""
Per-user in-memory state: current_session and Gemini chat object.
State is initialized lazily from disk on first access after a server restart.
"""
from __future__ import annotations

import history

# user_id -> {"current_session": dict, "chat": gemini ChatSession}
_user_states: dict = {}


def get_or_init(user_id: str, model) -> dict:
    """Return the state dict for a user, initializing from disk if needed."""
    if user_id not in _user_states:
        sessions = history.list_sessions(user_id)
        if sessions:
            current_session = history.load_session(sessions[0]["id"], user_id)
        else:
            current_session = history.create_session(user_id)
        chat = model.start_chat(
            history=history.build_initial_history(
                current_session["messages"], current_session["summary"]
            )
        )
        _user_states[user_id] = {"current_session": current_session, "chat": chat}
    return _user_states[user_id]


def set_state(user_id: str, state: dict) -> None:
    _user_states[user_id] = state


def invalidate(user_id: str) -> None:
    """Remove cached state so the next access re-initializes from disk."""
    _user_states.pop(user_id, None)
