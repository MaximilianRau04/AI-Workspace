import os

from dotenv import load_dotenv
from flask import Flask, redirect, render_template, url_for

import db
import rag
from routes import auth, chat, config, docs, sessions, voice

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")

app = Flask(
    __name__,
    template_folder="../frontend",
    static_folder="../frontend",
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
def index():
    from flask import session
    if "user_id" not in session:
        return redirect(url_for("auth.login_page"))
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True)
