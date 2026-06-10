from fastapi import HTTPException, Request


def login_required(request: Request) -> dict:
    if "user_id" not in request.session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user_id": request.session["user_id"], "username": request.session["username"]}
