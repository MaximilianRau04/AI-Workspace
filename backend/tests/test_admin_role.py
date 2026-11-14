"""Global settings (model, system prompt, MCP servers, pricing) are admin-only."""

import uuid

import pytest

import mcp_store
from db import get_session
from models.user import User


@pytest.fixture
def user_client(authed_client):
    """A logged-in user that is explicitly not an admin."""
    user_id = authed_client.get("/me").json()["user_id"]
    with get_session() as db:
        db.query(User).filter(User.id == user_id).update({"is_admin": False})
    return authed_client


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/config", {"system_prompt": "x"}),
        ("post", "/config/model", {"model": "x"}),
        ("post", "/config/presets", {"presets": []}),
        ("post", "/config/voice", {"tts_voice": "x"}),
        ("get", "/config/ollama-models", None),
        ("post", "/usage/pricing", {"pricing": {}}),
        ("post", "/mcp/servers", {"name": "X", "command": "npx"}),
        ("patch", "/mcp/servers/abc", {"enabled": False}),
        ("delete", "/mcp/servers/abc", None),
        ("post", "/mcp/servers/abc/authorize", None),
    ],
)
def test_global_settings_forbidden_for_regular_users(user_client, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    resp = getattr(user_client, method)(path, **kwargs)
    assert resp.status_code == 403, resp.text


def test_me_reports_admin_flag(user_client):
    assert user_client.get("/me").json()["is_admin"] is False


def test_admin_can_change_model_config(admin_client, monkeypatch):
    import llm

    saved = {}
    monkeypatch.setattr(llm, "save_config", lambda cfg: saved.update(cfg))
    resp = admin_client.post("/config/model", json={"model": "test-model"})
    assert resp.status_code == 200, resp.text
    assert saved["model"] == "test-model"


def test_regular_user_does_not_see_secrets(user_client, monkeypatch):
    import llm

    cfg = {
        "provider": "openai",
        "model": "m",
        "api_key": "sk-secret",
        "presets": [{"name": "p", "api_key": "sk-preset"}],
    }
    monkeypatch.setattr(llm, "load_config", lambda: dict(cfg))
    model = user_client.get("/config").json()["model"]
    assert model["api_key"] == ""
    assert model["presets"] == [{"name": "p", "api_key": ""}]

    mcp_store.add_server("S", "stdio", "npx", ["-y", "x"], {"TOKEN": "t"}, "", {}, "none")
    server = user_client.get("/mcp/servers").json()["servers"][0]
    assert server["name"] == "S"
    for key in ("env", "headers", "args", "oauth_tokens", "oauth_client_info"):
        assert key not in server


def test_later_registrations_are_not_admin(authed_client):
    from services import auth as auth_service

    user = auth_service.register(f"u_{uuid.uuid4().hex[:8]}", "testpass123")
    assert user.is_admin is False


def test_unauthenticated_requests_get_401(client):
    assert client.post("/config/model", json={}).status_code == 401
