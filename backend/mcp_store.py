"""Storage for configured MCP servers (global, analogous to llm.load_config/save_config)."""

from __future__ import annotations

import json
import os
import uuid

MCP_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "mcp_servers.json")

_UPDATABLE_FIELDS = (
    "name",
    "enabled",
    "transport",
    "command",
    "args",
    "env",
    "url",
    "headers",
    "auth",
    "oauth_client_info",
    "oauth_tokens",
)


def load_mcp_servers() -> list[dict]:
    if not os.path.exists(MCP_CONFIG_FILE) or os.path.isdir(MCP_CONFIG_FILE):
        return []
    with open(MCP_CONFIG_FILE, encoding="utf-8") as f:
        raw = f.read().strip()
    if not raw:
        return []
    servers = json.loads(raw).get("servers", [])
    for server in servers:
        server.setdefault("transport", "stdio")
        server.setdefault("url", "")
        server.setdefault("headers", {})
        server.setdefault("auth", "none")
        server.setdefault("oauth_client_info", None)
        server.setdefault("oauth_tokens", None)
    return servers


def save_mcp_servers(servers: list[dict]) -> None:
    with open(MCP_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"servers": servers}, f, indent=2)


def get_server(server_id: str) -> dict | None:
    for server in load_mcp_servers():
        if server["id"] == server_id:
            return server
    return None


def add_server(
    name: str,
    transport: str,
    command: str,
    args: list[str],
    env: dict[str, str],
    url: str,
    headers: dict[str, str],
    auth: str = "none",
) -> dict:
    servers = load_mcp_servers()
    server = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "enabled": True,
        "transport": transport,
        "command": command,
        "args": args,
        "env": env,
        "url": url,
        "headers": headers,
        "auth": auth,
        "oauth_client_info": None,
        "oauth_tokens": None,
    }
    servers.append(server)
    save_mcp_servers(servers)
    return server


def update_server(server_id: str, updates: dict) -> dict | None:
    servers = load_mcp_servers()
    for server in servers:
        if server["id"] == server_id:
            server.update({k: v for k, v in updates.items() if k in _UPDATABLE_FIELDS})
            save_mcp_servers(servers)
            return server
    return None


def delete_server(server_id: str) -> bool:
    servers = load_mcp_servers()
    remaining = [s for s in servers if s["id"] != server_id]
    if len(remaining) == len(servers):
        return False
    save_mcp_servers(remaining)
    return True
