import io
import os
import re
import tempfile

import edge_tts
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

import llm
from utils import login_required

router = APIRouter(tags=["voice"])

TTS_VOICE = "de-DE-ConradNeural"

_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            _whisper_model = whisper.load_model("base")
        except ImportError:
            raise RuntimeError(
                "Whisper is not installed. Run: pip install openai-whisper"
            )
    return _whisper_model


def _webm_to_wav(content: bytes) -> bytes:
    from pydub import AudioSegment
    webm = AudioSegment.from_file(io.BytesIO(content), format="webm")
    wav_io = io.BytesIO()
    webm.export(wav_io, format="wav")
    wav_io.seek(0)
    return wav_io.read()


class TTSBody(BaseModel):
    text: str = ""


@router.post("/tts")
async def tts(body: TTSBody, current_user: dict = Depends(login_required)):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    text = re.sub(r"[#*`_>~\[\]|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, TTS_VOICE)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])

    return Response(content=buf.getvalue(), media_type="audio/mpeg")


@router.post("/stt")
async def stt(
    audio: UploadFile = File(...),
    current_user: dict = Depends(login_required),
):
    content = await audio.read()
    wav_bytes = _webm_to_wav(content)

    backend = llm.load_config().get("stt_backend", "google")

    if backend == "whisper":
        try:
            model = _get_whisper_model()
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            tmp_path = f.name
        try:
            result = model.transcribe(tmp_path, language="de")
            return {"text": result["text"].strip()}
        finally:
            os.remove(tmp_path)

    # Google STT (default)
    import speech_recognition as sr_lib
    recognizer = sr_lib.Recognizer()
    with sr_lib.AudioFile(io.BytesIO(wav_bytes)) as source:
        audio_data = recognizer.record(source)
    try:
        text = recognizer.recognize_google(audio_data, language="de-DE")
        return {"text": text}
    except sr_lib.UnknownValueError:
        return {"text": ""}
    except sr_lib.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))
