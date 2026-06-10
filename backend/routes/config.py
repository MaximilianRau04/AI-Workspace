import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import llm
import state
from utils import login_required

SYSTEM_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "system_prompt.txt")

router = APIRouter(tags=["config"])


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


@router.get("/config")
async def get_config(current_user: dict = Depends(login_required)):
    model_cfg = llm.load_config()
    return {
        "system_prompt": load_system_prompt(),
        "model": {
            "provider":  model_cfg["provider"],
            "model":     model_cfg["model"],
            "api_key":   model_cfg.get("api_key", ""),
            "base_url":  model_cfg.get("base_url", ""),
            "reasoning": model_cfg.get("reasoning", False),
            "presets":   model_cfg.get("presets", []),
        },
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
