import json
import os
import uuid

from werkzeug.security import check_password_hash, generate_password_hash

USERS_FILE = os.path.join(os.path.dirname(__file__), "..", "users.json")


def _load() -> dict:
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def register(username: str, password: str) -> dict | None:
    """Create a new user. Returns user dict on success, None if username taken."""
    if not username or not password:
        return None
    data = _load()
    for user in data.values():
        if user["username"].lower() == username.lower():
            return None
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "username": username,
        "password_hash": generate_password_hash(password),
    }
    data[user_id] = user
    _save(data)
    return user


def authenticate(username: str, password: str) -> dict | None:
    """Return user dict if credentials are valid, None otherwise."""
    data = _load()
    for user in data.values():
        if user["username"].lower() == username.lower():
            if check_password_hash(user["password_hash"], password):
                return user
    return None


def get_user(user_id: str) -> dict | None:
    return _load().get(user_id)
