import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from rate_limit import RateLimiter
from services import auth as auth_service
from utils import login_required

router = APIRouter(tags=["auth"])

_base = os.path.dirname(os.path.abspath(__file__))
_dist = os.path.join(_base, "..", "..", "dist")
_frontend = os.path.join(_base, "..", "..", "frontend")
_serve = _dist if os.path.isdir(_dist) else _frontend


# Failed logins per client IP and per (client IP, username), and new accounts per client IP.
# The username limit is keyed by IP as well, so an attacker guessing someone else's
# password cannot lock the real user out from their own address.
login_ip_limiter = RateLimiter(max_attempts=10, window_seconds=15 * 60)
login_user_limiter = RateLimiter(max_attempts=5, window_seconds=15 * 60)
register_limiter = RateLimiter(max_attempts=5, window_seconds=60 * 60)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_limit(limiter: RateLimiter, key: str) -> None:
    wait = limiter.retry_after(key)
    if wait:
        raise HTTPException(
            status_code=429,
            detail="Zu viele Versuche. Bitte später erneut versuchen.",
            headers={"Retry-After": str(wait)},
        )


class AuthBody(BaseModel):
    username: str = ""
    password: str = ""


@router.get("/login")
async def login_page(request: Request):
    if "user_id" in request.session:
        return RedirectResponse(url="/")
    # The login page is a route of the React SPA, so it is served from index.html.
    return FileResponse(os.path.join(_serve, "index.html"))


@router.post("/login")
async def login(request: Request, body: AuthBody):
    username = body.username.strip()
    ip_key = _client_ip(request)
    user_key = f"{ip_key}|{username.lower()}"
    _check_limit(login_ip_limiter, ip_key)
    _check_limit(login_user_limiter, user_key)
    user = auth_service.authenticate(username, body.password)
    if not user:
        login_ip_limiter.hit(ip_key)
        login_user_limiter.hit(user_key)
        raise HTTPException(status_code=401, detail="Falscher Benutzername oder Passwort")
    login_user_limiter.reset(user_key)
    request.session["user_id"] = user.id
    request.session["username"] = user.username
    return {"ok": True}


@router.post("/register")
async def register(request: Request, body: AuthBody):
    username = body.username.strip()
    _check_limit(register_limiter, _client_ip(request))
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Benutzername muss mindestens 3 Zeichen haben")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Passwort muss mindestens 6 Zeichen haben")
    user = auth_service.register(username, body.password)
    if not user:
        raise HTTPException(status_code=409, detail="Benutzername bereits vergeben")
    register_limiter.hit(_client_ip(request))
    request.session["user_id"] = user.id
    request.session["username"] = user.username
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@router.get("/me")
async def me(current_user: dict = Depends(login_required)):
    return {
        "username": current_user["username"],
        "user_id": current_user["user_id"],
        "is_admin": current_user["is_admin"],
    }
