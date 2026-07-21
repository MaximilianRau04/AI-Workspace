"""Unit tests for the MCP server storage layer (backend/mcp_store.py)."""

import mcp_store


def test_load_missing_file_returns_empty():
    assert mcp_store.load_mcp_servers() == []


def test_add_and_load_server():
    server = mcp_store.add_server("Filesystem", "npx", ["-y", "server-fs"], {"FOO": "bar"})

    assert server["name"] == "Filesystem"
    assert server["command"] == "npx"
    assert server["args"] == ["-y", "server-fs"]
    assert server["env"] == {"FOO": "bar"}
    assert server["enabled"] is True
    assert server["id"]

    servers = mcp_store.load_mcp_servers()
    assert servers == [server]


def test_add_multiple_servers_get_distinct_ids():
    a = mcp_store.add_server("A", "npx", [], {})
    b = mcp_store.add_server("B", "npx", [], {})

    assert a["id"] != b["id"]
    assert [s["id"] for s in mcp_store.load_mcp_servers()] == [a["id"], b["id"]]


def test_update_server_partial_fields():
    server = mcp_store.add_server("Filesystem", "npx", ["-y"], {})

    updated = mcp_store.update_server(server["id"], {"enabled": False})

    assert updated["enabled"] is False
    # untouched fields survive the partial update
    assert updated["name"] == "Filesystem"
    assert updated["command"] == "npx"


def test_update_server_ignores_unknown_fields():
    server = mcp_store.add_server("Filesystem", "npx", [], {})

    updated = mcp_store.update_server(server["id"], {"id": "hijacked", "unknown": "x"})

    assert updated["id"] == server["id"]
    assert "unknown" not in updated


def test_update_unknown_server_returns_none():
    assert mcp_store.update_server("does-not-exist", {"enabled": False}) is None


def test_delete_server():
    server = mcp_store.add_server("Filesystem", "npx", [], {})

    assert mcp_store.delete_server(server["id"]) is True
    assert mcp_store.load_mcp_servers() == []


def test_delete_unknown_server_returns_false():
    assert mcp_store.delete_server("does-not-exist") is False


def test_load_tolerates_empty_file():
    # Reproduces what happens when Docker's entrypoint `touch`es a JSON config
    # file that doesn't exist yet on the host (0-byte file, not valid JSON).
    open(mcp_store.MCP_CONFIG_FILE, "w").close()

    assert mcp_store.load_mcp_servers() == []


def test_load_tolerates_directory_at_config_path():
    # Reproduces Docker bind-mounting a nonexistent host file as a directory.
    import os

    os.makedirs(mcp_store.MCP_CONFIG_FILE)

    assert mcp_store.load_mcp_servers() == []
