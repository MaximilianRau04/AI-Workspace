import os
import sys

import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, redirect, render_template, url_for

import rag
from routes import auth, chat, config, docs, sessions, voice

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY not found in .env")
    sys.exit(1)

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")

SYSTEM_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "system_prompt.txt")


def _load_system_prompt() -> str:
    if not os.path.exists(SYSTEM_PROMPT_FILE):
        return ""
    with open(SYSTEM_PROMPT_FILE, encoding="utf-8") as f:
        return f.read().strip()


# --- App factory ---

app = Flask(
    __name__,
    template_folder="../frontend",
    static_folder="../frontend",
    static_url_path="",
)
app.secret_key = SECRET_KEY

# Shared Gemini model (stateless config; per-user chat objects live in state.py)
genai.configure(api_key=API_KEY)
rag.init(API_KEY)
app.config["model"] = genai.GenerativeModel(
    "gemini-2.5-flash",
    system_instruction=_load_system_prompt() or None,
)

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
