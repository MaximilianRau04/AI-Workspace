"""API-level tests for the /mcp/servers endpoints (backend/routes/mcp.py)."""


def test_list_servers_requires_auth(client):
    resp = client.get("/mcp/servers")
    assert resp.status_code == 401


def test_create_requires_auth(client):
    resp = client.post("/mcp/servers", json={"name": "X", "command": "npx"})
    assert resp.status_code == 401


def test_create_list_update_delete_flow(authed_client):
    c = authed_client

    # starts empty
    assert c.get("/mcp/servers").json()["servers"] == []

    # create
    resp = c.post(
        "/mcp/servers",
        json={
            "name": "Filesystem",
            "command": "npx",
            "args": ["-y", "server-fs"],
            "env": {"FOO": "bar"},
        },
    )
    assert resp.status_code == 200, resp.text
    server = resp.json()
    assert server["name"] == "Filesystem"
    assert server["enabled"] is True
    server_id = server["id"]

    # list includes it, merged with (mocked, empty) live status
    listed = c.get("/mcp/servers").json()["servers"]
    assert len(listed) == 1
    assert listed[0]["id"] == server_id
    assert listed[0]["status"] is None

    # partial update — only enabled changes, other fields survive
    resp = c.patch(f"/mcp/servers/{server_id}", json={"enabled": False})
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["enabled"] is False
    assert updated["name"] == "Filesystem"
    assert updated["command"] == "npx"

    # full field update (what the Settings "Edit" form sends)
    resp = c.patch(
        f"/mcp/servers/{server_id}",
        json={"name": "Renamed", "command": "uvx", "args": ["x"], "env": {}},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["name"] == "Renamed"
    assert updated["command"] == "uvx"
    assert updated["args"] == ["x"]

    # delete
    resp = c.delete(f"/mcp/servers/{server_id}")
    assert resp.status_code == 200
    assert c.get("/mcp/servers").json()["servers"] == []


def test_create_missing_name_returns_400(authed_client):
    resp = authed_client.post("/mcp/servers", json={"name": "  ", "command": "npx"})
    assert resp.status_code == 400


def test_create_missing_command_returns_400(authed_client):
    resp = authed_client.post("/mcp/servers", json={"name": "X", "command": "  "})
    assert resp.status_code == 400


def test_create_http_server(authed_client):
    resp = authed_client.post(
        "/mcp/servers",
        json={
            "name": "Remote",
            "transport": "http",
            "url": "https://example.com/mcp",
            "headers": {"Authorization": "Bearer token"},
        },
    )
    assert resp.status_code == 200, resp.text
    server = resp.json()
    assert server["transport"] == "http"
    assert server["url"] == "https://example.com/mcp"
    assert server["headers"] == {"Authorization": "Bearer token"}
    assert server["command"] == ""


def test_create_remote_missing_url_returns_400(authed_client):
    resp = authed_client.post(
        "/mcp/servers", json={"name": "Remote", "transport": "sse", "url": "  "}
    )
    assert resp.status_code == 400


def test_create_invalid_transport_falls_back_to_stdio(authed_client):
    resp = authed_client.post(
        "/mcp/servers", json={"name": "X", "transport": "carrier-pigeon", "command": "npx"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["transport"] == "stdio"


def test_update_invalid_transport_returns_400(authed_client):
    resp = authed_client.post("/mcp/servers", json={"name": "X", "command": "npx"})
    server_id = resp.json()["id"]

    resp = authed_client.patch(f"/mcp/servers/{server_id}", json={"transport": "carrier-pigeon"})
    assert resp.status_code == 400


def test_update_unknown_server_returns_404(authed_client):
    resp = authed_client.patch("/mcp/servers/does-not-exist", json={"enabled": False})
    assert resp.status_code == 404


def test_delete_unknown_server_returns_404(authed_client):
    resp = authed_client.delete("/mcp/servers/does-not-exist")
    assert resp.status_code == 404


def test_create_oauth_server(authed_client):
    resp = authed_client.post(
        "/mcp/servers",
        json={
            "name": "Remote",
            "transport": "http",
            "url": "https://example.com/mcp",
            "auth": "oauth",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["auth"] == "oauth"


def test_create_oauth_with_stdio_transport_returns_400(authed_client):
    resp = authed_client.post("/mcp/servers", json={"name": "X", "command": "npx", "auth": "oauth"})
    assert resp.status_code == 400


def test_update_invalid_auth_returns_400(authed_client):
    resp = authed_client.post("/mcp/servers", json={"name": "X", "command": "npx"})
    server_id = resp.json()["id"]

    resp = authed_client.patch(f"/mcp/servers/{server_id}", json={"auth": "carrier-pigeon"})
    assert resp.status_code == 400


def test_authorize_requires_auth(client):
    resp = client.post("/mcp/servers/does-not-exist/authorize")
    assert resp.status_code == 401


def test_authorize_unknown_server_returns_404(authed_client):
    resp = authed_client.post("/mcp/servers/does-not-exist/authorize")
    assert resp.status_code == 404


def test_authorize_non_oauth_server_returns_400(authed_client):
    resp = authed_client.post("/mcp/servers", json={"name": "X", "command": "npx"})
    server_id = resp.json()["id"]

    resp = authed_client.post(f"/mcp/servers/{server_id}/authorize")
    assert resp.status_code == 400


def test_authorize_oauth_server(authed_client):
    resp = authed_client.post(
        "/mcp/servers",
        json={
            "name": "Remote",
            "transport": "http",
            "url": "https://example.com/mcp",
            "auth": "oauth",
        },
    )
    server_id = resp.json()["id"]

    resp = authed_client.post(f"/mcp/servers/{server_id}/authorize")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}


def test_oauth_callback_missing_params_shows_error_page(client):
    resp = client.get("/mcp/oauth/callback")
    assert resp.status_code == 200
    assert "Missing authorization code" in resp.text


def test_oauth_callback_provider_error_shows_error_page(client):
    resp = client.get("/mcp/oauth/callback", params={"error": "access_denied"})
    assert resp.status_code == 200
    assert "access_denied" in resp.text


def test_oauth_callback_unknown_state_shows_expired_page(client):
    resp = client.get("/mcp/oauth/callback", params={"code": "abc", "state": "unknown"})
    assert resp.status_code == 200
    assert "no longer valid" in resp.text


def test_oauth_callback_resolves_pending_flow(client, monkeypatch):
    from mcp_manager import manager as mcp_manager_instance

    monkeypatch.setattr(mcp_manager_instance, "resolve_oauth_callback", lambda state, code: True)

    resp = client.get("/mcp/oauth/callback", params={"code": "abc", "state": "xyz"})
    assert resp.status_code == 200
    assert "Authorization complete" in resp.text
