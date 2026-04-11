import asyncio
import io
import re

import edge_tts
from flask import Blueprint, Response, jsonify, request

from utils import login_required

bp = Blueprint("voice", __name__)

TTS_VOICE = "de-DE-ConradNeural"


@bp.route("/tts", methods=["POST"])
@login_required
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


@bp.route("/stt", methods=["POST"])
@login_required
def stt():
    import speech_recognition as sr_lib
    from pydub import AudioSegment

    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify({"error": "No audio"}), 400
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
