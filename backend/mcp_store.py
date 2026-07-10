"""Storage for configured MCP servers (global, analogous to llm.load_config/save_config)."""

from __future__ import annotations

import json
import os
import uuid

MCP_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "mcp_servers.json")


def load_mcp_servers() -> list[dict]:
    if not os.path.exists(MCP_CONFIG_FILE):
        return []
    with open(MCP_CONFIG_FILE, encoding="utf-8") as f:
        return json.load(f).get("servers", [])


def save_mcp_servers(servers: list[dict]) -> None:
    with open(MCP_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"servers": servers}, f, indent=2)


def add_server(name: str, command: str, args: list[str], env: dict[str, str]) -> dict:
    servers = load_mcp_servers()
    server = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "enabled": True,
        "command": command,
        "args": args,
        "env": env,
    }
    servers.append(server)
    save_mcp_servers(servers)
    return server


def update_server(server_id: str, updates: dict) -> dict | None:
    servers = load_mcp_servers()
    for server in servers:
        if server["id"] == server_id:
            server.update(
                {
                    k: v
                    for k, v in updates.items()
                    if k in ("name", "enabled", "command", "args", "env")
                }
            )
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
