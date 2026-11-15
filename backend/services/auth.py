import uuid

from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_session
from models.user import User
from schemas.user import UserOut


def register(username: str, password: str) -> UserOut | None:
    if not username or not password:
        return None
    user_id = str(uuid.uuid4())
    try:
        with get_session() as db:
            # The first account on a fresh install becomes the admin.
            is_admin = db.query(User.id).first() is None
            db.add(
                User(
                    id=user_id,
                    username=username,
                    password_hash=generate_password_hash(password),
                    is_admin=is_admin,
                )
            )
        return UserOut(id=user_id, username=username, is_admin=is_admin)
    except IntegrityError:
        return None


def authenticate(username: str, password: str) -> UserOut | None:
    with get_session() as db:
        user = db.query(User).filter(User.username.ilike(username)).first()
        if user and check_password_hash(user.password_hash, password):
            return UserOut(id=user.id, username=user.username, is_admin=bool(user.is_admin))
    return None
