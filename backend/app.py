import os

from dotenv import load_dotenv
from flask import Flask, redirect, render_template, url_for

import db
import rag
from routes import auth, chat, config, docs, sessions, voice

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")

_base     = os.path.dirname(os.path.abspath(__file__))
_dist     = os.path.join(_base, "..", "dist")
_frontend = os.path.join(_base, "..", "frontend")
_serve    = _dist if os.path.isdir(_dist) else _frontend

app = Flask(
    __name__,
    template_folder=_serve,
    static_folder=_serve,
    static_url_path="",
)
app.secret_key = SECRET_KEY
db.init_db()

# RAG uses Gemini embeddings – initialise only when a key is available.
_gemini_key = os.getenv("GEMINI_API_KEY")
if _gemini_key:
    rag.init(_gemini_key)

# --- Blueprints ---

app.register_blueprint(auth.bp)
app.register_blueprint(config.bp)
app.register_blueprint(sessions.bp)
app.register_blueprint(chat.bp)
app.register_blueprint(docs.bp)
app.register_blueprint(voice.bp)


# --- Main routes ---

@app.route("/")
@app.route("/c/<session_id>")
def index(session_id=None):
    from flask import session
    if "user_id" not in session:
        return redirect(url_for("auth.login_page"))
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True)
