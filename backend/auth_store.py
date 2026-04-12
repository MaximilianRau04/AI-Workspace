import sqlite3
import uuid

from werkzeug.security import check_password_hash, generate_password_hash

import db


def register(username: str, password: str) -> dict | None:
    """Create a new user. Returns user dict on success, None if username taken."""
    if not username or not password:
        return None
    user_id = str(uuid.uuid4())
    try:
        with db.get_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (user_id, username, generate_password_hash(password)),
            )
        return {"id": user_id, "username": username}
    except sqlite3.IntegrityError:
        return None


def authenticate(username: str, password: str) -> dict | None:
    """Return user dict if credentials are valid, None otherwise."""
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    if row and check_password_hash(row["password_hash"], password):
        return {"id": row["id"], "username": row["username"]}
    return None


def get_user(user_id: str) -> dict | None:
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, username FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return {"id": row["id"], "username": row["username"]} if row else None
