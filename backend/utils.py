from fastapi import HTTPException, Request

from db import get_session
from models.user import User


def login_required(request: Request) -> dict:
    if "user_id" not in request.session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = request.session["user_id"]
    with get_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
    if not user:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user_id": user_id, "username": request.session["username"]}
