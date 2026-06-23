import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import llm
import state
from db import get_session
from models.user import User
from utils import login_required

SYSTEM_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "system_prompt.txt")

router = APIRouter(tags=["config"])


def get_user_data(user_id: str) -> dict:
    with get_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"profile": "", "memory": ""}
        return {"profile": user.profile or "", "memory": user.memory or ""}


def save_user_profile(user_id: str, profile: str) -> None:
    with get_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.profile = profile


def save_user_memory(user_id: str, memory: str) -> None:
    with get_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.memory = memory


def load_system_prompt() -> str:
    if not os.path.exists(SYSTEM_PROMPT_FILE):
        return ""
    with open(SYSTEM_PROMPT_FILE, encoding="utf-8") as f:
        return f.read().strip()


class ConfigBody(BaseModel):
    system_prompt: str = ""


class ModelConfigBody(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    reasoning: Optional[bool] = None


class PresetsBody(BaseModel):
    presets: List = []


class VoiceConfigBody(BaseModel):
    stt_backend: Optional[str] = None


class ProfileBody(BaseModel):
    profile: str = ""


@router.get("/config")
async def get_config(current_user: dict = Depends(login_required)):
    user_id = current_user["user_id"]
    model_cfg = llm.load_config()
    user_data = get_user_data(user_id)
    return {
        "system_prompt": load_system_prompt(),
        "profile": user_data["profile"],
        "memory":  user_data["memory"],
        "model": {
            "provider":  model_cfg["provider"],
            "model":     model_cfg["model"],
            "api_key":   model_cfg.get("api_key", ""),
            "base_url":  model_cfg.get("base_url", ""),
            "reasoning": model_cfg.get("reasoning", False),
            "presets":   model_cfg.get("presets", []),
        },
        "stt_backend": model_cfg.get("stt_backend", "google"),
    }


@router.post("/config")
async def set_config(body: ConfigBody, current_user: dict = Depends(login_required)):
    with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
        f.write(body.system_prompt.strip())
    state.invalidate_all()
    return {"ok": True}


@router.post("/config/model")
async def set_model_config(body: ModelConfigBody, current_user: dict = Depends(login_required)):
    cfg = llm.load_config()
    cfg.update({
        "provider":  body.provider  if body.provider  is not None else cfg["provider"],
        "model":     body.model     if body.model     is not None else cfg["model"],
        "api_key":   body.api_key   if body.api_key   is not None else cfg.get("api_key", ""),
        "base_url":  body.base_url  if body.base_url  is not None else cfg.get("base_url", ""),
        "reasoning": body.reasoning if body.reasoning is not None else cfg.get("reasoning", False),
    })
    llm.save_config(cfg)
    state.invalidate_all()
    return {"ok": True}


@router.post("/config/presets")
async def set_presets(body: PresetsBody, current_user: dict = Depends(login_required)):
    cfg = llm.load_config()
    cfg["presets"] = body.presets
    llm.save_config(cfg)
    return {"ok": True}


@router.post("/config/voice")
async def set_voice_config(body: VoiceConfigBody, current_user: dict = Depends(login_required)):
    cfg = llm.load_config()
    if body.stt_backend is not None:
        cfg["stt_backend"] = body.stt_backend
    llm.save_config(cfg)
    return {"ok": True}


@router.post("/config/profile")
async def set_profile(body: ProfileBody, current_user: dict = Depends(login_required)):
    save_user_profile(current_user["user_id"], body.profile.strip())
    return {"ok": True}


@router.delete("/config/memory")
async def clear_memory(current_user: dict = Depends(login_required)):
    save_user_memory(current_user["user_id"], "")
    return {"ok": True}


@router.get("/config/ollama-models")
async def ollama_models(
    base_url: str = "http://localhost:11434/v1",
    current_user: dict = Depends(login_required),
):
    try:
        models = llm.list_ollama_models(base_url)
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
