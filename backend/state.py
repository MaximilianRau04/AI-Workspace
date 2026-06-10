"""Per-user in-memory state: the current ChatSessionSchema for each user."""
from __future__ import annotations

from services import chat as chat_service

_user_states: dict[str, dict] = {}


def get_or_init(user_id: str) -> dict:
    if user_id not in _user_states:
        all_sessions = chat_service.list_sessions(user_id)
        current = (
            chat_service.get_session_by_id(all_sessions[0].id, user_id)
            if all_sessions
            else chat_service.create_session(user_id)
        )
        _user_states[user_id] = {"current_session": current}
    return _user_states[user_id]


def set_state(user_id: str, state: dict) -> None:
    _user_states[user_id] = state


def invalidate(user_id: str) -> None:
    _user_states.pop(user_id, None)


def invalidate_all() -> None:
    _user_states.clear()
