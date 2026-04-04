import os
import sys
import json
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from werkzeug.utils import secure_filename
import google.generativeai as genai
from dotenv import load_dotenv
import history
import rag

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY not found in .env")
    sys.exit(1)

SYSTEM_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "system_prompt.txt")

def load_system_prompt() -> str:
    if not os.path.exists(SYSTEM_PROMPT_FILE):
        return ""
    with open(SYSTEM_PROMPT_FILE, encoding="utf-8") as f:
        return f.read().strip()

genai.configure(api_key=API_KEY)
rag.init(API_KEY)
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    system_instruction=load_system_prompt() or None,
)

messages, summary = history.load()
chat = model.start_chat(history=history.build_initial_history(messages, summary))

app = Flask(
    __name__,
    template_folder="../templates",
    static_folder="../templates",
    static_url_path="",
)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/config", methods=["GET"])
def get_config():
    return jsonify({"system_prompt": load_system_prompt()})


@app.route("/config", methods=["POST"])
def set_config():
    global model, chat, messages, summary
    data = request.get_json()
    new_prompt = data.get("system_prompt", "").strip()

    with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
        f.write(new_prompt)

    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=new_prompt or None,
    )
    messages, summary = history.load()
    chat = model.start_chat(history=history.build_initial_history(messages, summary))

    return jsonify({"ok": True})


@app.route("/chat", methods=["POST"])
def chat_endpoint():
    data = request.get_json()
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    attached_file = data.get("attached_file")

    def generate():
        global messages, summary
        full_reply = ""
        context = rag.retrieve(user_message, filename=attached_file)
        augmented = f"{context}\n\nUser: {user_message}" if context else user_message
        try:
            response = chat.send_message(augmented, stream=True)
            for chunk in response:
                if chunk.text:
                    full_reply += chunk.text
                    yield f"data: {json.dumps(chunk.text)}\n\n"

            usage = response.usage_metadata
            yield f"event: usage\ndata: {json.dumps({
                'prompt':    usage.prompt_token_count,
                'reply':     usage.candidates_token_count,
                'total':     usage.total_token_count,
            })}\n\n"
        except Exception as e:
            yield f"data: {json.dumps('[ERROR] ' + str(e))}\n\n"
            return
        finally:
            yield "data: \"[DONE]\"\n\n"

        messages.append({"role": "user", "parts": [user_message]})  # save original, not augmented
        messages.append({"role": "model", "parts": [full_reply]})

        if history.needs_summarization(messages):
            messages, summary = history.summarize(messages, model)

        history.save(messages, summary)

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


@app.route("/docs", methods=["GET"])
def list_docs():
    return jsonify({"files": rag.list_indexed()})


@app.route("/docs/upload", methods=["POST"])
def upload_doc():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file"}), 400
    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
    os.makedirs(rag.DOCS_DIR, exist_ok=True)
    file.save(os.path.join(rag.DOCS_DIR, filename))
    chunks = rag.index_file(filename)
    return jsonify({"file": filename, "chunks": chunks})


@app.route("/docs/delete", methods=["POST"])
def delete_doc():
    filename = request.get_json().get("file")
    if not filename:
        return jsonify({"error": "No filename"}), 400
    rag.delete_file(filename)
    path = os.path.join(rag.DOCS_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True)
