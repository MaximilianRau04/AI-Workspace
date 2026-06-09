import os

from flask import Blueprint, jsonify, request, session

import llm
import state
from utils import login_required

SYSTEM_PROMPT_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "system_prompt.txt")

bp = Blueprint("config", __name__)


def load_system_prompt() -> str:
    if not os.path.exists(SYSTEM_PROMPT_FILE):
        return ""
    with open(SYSTEM_PROMPT_FILE, encoding="utf-8") as f:
        return f.read().strip()


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

@bp.route("/config", methods=["GET"])
@login_required
def get_config():
    model_cfg = llm.load_config()
    return jsonify({
        "system_prompt": load_system_prompt(),
        "model": {
            "provider": model_cfg["provider"],
            "model":    model_cfg["model"],
            "api_key":  model_cfg.get("api_key", ""),
            "base_url": model_cfg.get("base_url", ""),
        },
    })


@bp.route("/config", methods=["POST"])
@login_required
def set_config():
    data       = request.get_json()
    new_prompt = data.get("system_prompt", "").strip()

    with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
        f.write(new_prompt)

    # Invalidate all in-memory state so next request uses new prompt
    state.invalidate_all()

    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Model config
# ---------------------------------------------------------------------------

@bp.route("/config/model", methods=["POST"])
@login_required
def set_model_config():
    data = request.get_json()
    cfg  = llm.load_config()
    cfg.update({
        "provider": data.get("provider", cfg["provider"]),
        "model":    data.get("model",    cfg["model"]),
        "api_key":  data.get("api_key",  cfg.get("api_key", "")),
        "base_url": data.get("base_url", cfg.get("base_url", "")),
    })
    llm.save_config(cfg)
    state.invalidate_all()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Ollama model discovery
# ---------------------------------------------------------------------------

@bp.route("/config/ollama-models", methods=["GET"])
@login_required
def ollama_models():
    base_url = request.args.get("base_url", "http://localhost:11434/v1")
    try:
        models = llm.list_ollama_models(base_url)
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 502
