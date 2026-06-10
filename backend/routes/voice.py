import io
import re

import edge_tts
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from utils import login_required

router = APIRouter(tags=["voice"])

TTS_VOICE = "de-DE-ConradNeural"


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
    import speech_recognition as sr_lib
    from pydub import AudioSegment

    content = await audio.read()
    webm = AudioSegment.from_file(io.BytesIO(content), format="webm")
    wav_io = io.BytesIO()
    webm.export(wav_io, format="wav")
    wav_io.seek(0)

    recognizer = sr_lib.Recognizer()
    with sr_lib.AudioFile(wav_io) as source:
        audio_data = recognizer.record(source)
    try:
        text = recognizer.recognize_google(audio_data, language="de-DE")
        return {"text": text}
    except sr_lib.UnknownValueError:
        return {"text": ""}
    except sr_lib.RequestError as e:
        raise HTTPException(status_code=500, detail=str(e))
