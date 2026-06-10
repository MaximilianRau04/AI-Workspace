import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from services import auth as auth_service

router = APIRouter(tags=["auth"])

_base = os.path.dirname(os.path.abspath(__file__))
_dist = os.path.join(_base, "..", "..", "dist")
_frontend = os.path.join(_base, "..", "..", "frontend")
_serve = _dist if os.path.isdir(_dist) else _frontend


class AuthBody(BaseModel):
    username: str = ""
    password: str = ""


@router.get("/login")
async def login_page(request: Request):
    if "user_id" in request.session:
        return RedirectResponse(url="/")
    return FileResponse(os.path.join(_serve, "login.html"))


@router.post("/login")
async def login(request: Request, body: AuthBody):
    user = auth_service.authenticate(body.username.strip(), body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Falscher Benutzername oder Passwort")
    request.session["user_id"] = user.id
    request.session["username"] = user.username
    return {"ok": True}


@router.post("/register")
async def register(request: Request, body: AuthBody):
    username = body.username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Benutzername muss mindestens 3 Zeichen haben")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 6 Zeichen haben")
    user = auth_service.register(username, body.password)
    if not user:
        raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")
    request.session["user_id"] = user.id
    request.session["username"] = user.username
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    if "user_id" not in request.session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"username": request.session["username"], "user_id": request.session["user_id"]}
