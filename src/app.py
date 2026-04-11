import os
import sys
import json
import re
import asyncio
import io
import edge_tts
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

# Session management
history.migrate_legacy()

sessions = history.list_sessions()
if sessions:
    current_session = history.load_session(sessions[0]["id"])
else:
    current_session = history.create_session()

chat = model.start_chat(
    history=history.build_initial_history(
        current_session["messages"], current_session["summary"]
    )
)

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
    global model, chat, current_session
    data = request.get_json()
    new_prompt = data.get("system_prompt", "").strip()

    with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
        f.write(new_prompt)

    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=new_prompt or None,
    )
    chat = model.start_chat(
        history=history.build_initial_history(
            current_session["messages"], current_session["summary"]
        )
    )
    return jsonify({"ok": True})


# --- Session endpoints ---

@app.route("/sessions", methods=["GET"])
def get_sessions():
    return jsonify({
        "sessions": history.list_sessions(),
        "current_id": current_session["id"],
    })


@app.route("/sessions/new", methods=["POST"])
def new_session():
    global current_session, chat
    current_session = history.create_session()
    chat = model.start_chat(history=[])
    return jsonify({"id": current_session["id"]})


@app.route("/sessions/<session_id>", methods=["GET"])
def load_session_route(session_id):
    global current_session, chat
    session = history.load_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    current_session = session
    chat = model.start_chat(
        history=history.build_initial_history(session["messages"], session["summary"])
    )
    return jsonify({
        "id": session["id"],
        "title": session.get("title") or "",
        "messages": session["messages"],
    })


@app.route("/sessions/<session_id>", methods=["DELETE"])
def delete_session_route(session_id):
    global current_session, chat
    history.delete_session(session_id)
    if current_session["id"] == session_id:
        remaining = history.list_sessions()
        if remaining:
            current_session = history.load_session(remaining[0]["id"])
        else:
            current_session = history.create_session()
        chat = model.start_chat(
            history=history.build_initial_history(
                current_session["messages"], current_session["summary"]
            )
        )
    return jsonify({"ok": True, "current_id": current_session["id"]})


# --- Helper functions ---

def _parse_error(e: Exception) -> dict:
    msg = str(e)
    if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
        retry = None
        import re
        m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", msg)
        if m:
            retry = int(m.group(1))
        return {
            "type": "rate_limit",
            "title": "Rate limit reached",
            "detail": "You've hit the free tier limit for Gemini API requests.",
            "retry_after": retry,
        }
    if "401" in msg or "403" in msg or "API key" in msg.lower():
        return {"type": "auth", "title": "Invalid API key", "detail": "Check your GEMINI_API_KEY in .env."}
    return {"type": "generic", "title": "Something went wrong", "detail": msg}


def _generate_title(user_msg: str, bot_msg: str) -> str:
    prompt = (
        "Generate a very short title (max 5 words, no quotes, no punctuation at the end) "
        "for this conversation based on the first exchange. "
        "Use the same language as the conversation. Respond with only the title.\n\n"
        f"User: {user_msg[:300]}\n"
        f"Assistant: {bot_msg[:300]}"
    )
    response = model.generate_content(prompt)
    return response.text.strip().strip('"\'').strip()[:60]


# --- Chat endpoint ---

@app.route("/chat", methods=["POST"])
def chat_endpoint():
    data = request.get_json()
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    attached_file = data.get("attached_file")

    def generate():
        global current_session
        is_first_message = len(current_session["messages"]) == 0
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
            yield f"event: error\ndata: {json.dumps(_parse_error(e))}\n\n"
            yield "data: \"[DONE]\"\n\n"
            return

        # Save messages
        current_session["messages"].append({"role": "user", "parts": [user_message]})
        current_session["messages"].append({"role": "model", "parts": [full_reply]})

        if history.needs_summarization(current_session["messages"]):
            new_msgs, new_summary = history.summarize(current_session["messages"], model)
            current_session["messages"] = new_msgs
            current_session["summary"] = new_summary

        # Generate title on first exchange
        if is_first_message and full_reply:
            try:
                title = _generate_title(user_message, full_reply)
                current_session["title"] = title
                yield f"event: title\ndata: {json.dumps({'id': current_session['id'], 'title': title})}\n\n"
            except Exception:
                pass

        history.save_session(current_session)
        yield "data: \"[DONE]\"\n\n"

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


TTS_VOICE = "de-DE-ConradNeural"


@app.route("/tts", methods=["POST"])
def tts():
    text = request.get_json().get("text", "").strip()
    if not text:
        return "", 400
    text = re.sub(r"[#*`_>~\[\]|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    async def _synthesize():
        buf = io.BytesIO()
        communicate = edge_tts.Communicate(text, TTS_VOICE)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()

    audio = asyncio.run(_synthesize())
    return Response(audio, mimetype="audio/mpeg")


@app.route("/stt", methods=["POST"])
def stt():
    import speech_recognition as sr_lib
    from pydub import AudioSegment
    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify({"error": "No audio"}), 400
    # convert webm → wav in memory
    webm = AudioSegment.from_file(audio_file, format="webm")
    wav_io = io.BytesIO()
    webm.export(wav_io, format="wav")
    wav_io.seek(0)
    recognizer = sr_lib.Recognizer()
    with sr_lib.AudioFile(wav_io) as source:
        audio = recognizer.record(source)
    try:
        text = recognizer.recognize_google(audio, language="de-DE")
        return jsonify({"text": text})
    except sr_lib.UnknownValueError:
        return jsonify({"text": ""})
    except sr_lib.RequestError as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
