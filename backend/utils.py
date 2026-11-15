from fastapi import Depends, HTTPException, Request

from db import get_session
from models.user import User


def login_required(request: Request) -> dict:
    if "user_id" not in request.session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = request.session["user_id"]
    with get_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        is_admin = bool(user.is_admin) if user else False
    if not user:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user_id": user_id, "username": request.session["username"], "is_admin": is_admin}


def admin_required(current_user: dict = Depends(login_required)) -> dict:
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user
