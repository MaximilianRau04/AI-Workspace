"""
Per-user in-memory state: just the current session dict.
State is initialized lazily from disk on first access.
"""
from __future__ import annotations

import history

# user_id -> {"current_session": dict}
_user_states: dict = {}


def get_or_init(user_id: str) -> dict:
    """Return the state dict for a user, initializing from disk if needed."""
    if user_id not in _user_states:
        sessions = history.list_sessions(user_id)
        if sessions:
            current_session = history.load_session(sessions[0]["id"], user_id)
        else:
            current_session = history.create_session(user_id)
        _user_states[user_id] = {"current_session": current_session}
    return _user_states[user_id]


def set_state(user_id: str, state: dict) -> None:
    _user_states[user_id] = state


def invalidate(user_id: str) -> None:
    """Remove cached state so the next access re-initializes from disk."""
    _user_states.pop(user_id, None)


def invalidate_all() -> None:
    """Invalidate all users (called when global config changes)."""
    _user_states.clear()
