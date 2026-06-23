import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

import db
import rag
from routes import auth, chat, config, docs, folders, voice

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")

_base     = os.path.dirname(os.path.abspath(__file__))
_dist     = os.path.join(_base, "..", "dist")
_frontend = os.path.join(_base, "..", "frontend")
_serve    = _dist if os.path.isdir(_dist) else _frontend


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    _gemini_key = os.getenv("GEMINI_API_KEY")
    if _gemini_key:
        rag.init(_gemini_key)
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

# --- Routers ---

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(config.router)
app.include_router(docs.router)
app.include_router(folders.router)
app.include_router(voice.router)


# --- SPA routes (must be before StaticFiles mount) ---

@app.get("/")
@app.get("/c/{session_id}")
async def index(request: Request, session_id: str = None):
    if "user_id" not in request.session:
        return RedirectResponse(url="/login")
    return FileResponse(os.path.join(_serve, "index.html"))


# --- Static files (catch-all, must be last) ---

app.mount("/", StaticFiles(directory=_serve, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
