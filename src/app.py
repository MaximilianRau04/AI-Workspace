import os
import sys
import json
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY not found in .env")
    sys.exit(1)

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")
chat = model.start_chat(history=[])

app = Flask(
    __name__,
    template_folder="../templates",
    static_folder="../templates",
    static_url_path="",
)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat_endpoint():
    data = request.get_json()
    user_message = data.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    def generate():
        try:
            response = chat.send_message(user_message, stream=True)
            for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps(chunk.text)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps('[ERROR] ' + str(e))}\n\n"
        yield "data: \"[DONE]\"\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(debug=True)
