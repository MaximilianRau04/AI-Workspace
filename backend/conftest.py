import os
import shutil
import tempfile
import uuid

# Must run before `db` (or anything importing it) is loaded for the first time —
# db.py reads DATABASE_URL at module import time to build its engine.
_tmpdir = tempfile.mkdtemp(prefix="ai-workspace-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmpdir, 'test.db')}"
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.pop("GEMINI_API_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import mcp_store  # noqa: E402
from mcp_manager import manager as mcp_manager_instance  # noqa: E402


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_tmpdir, ignore_errors=True)


@pytest.fixture(autouse=True)
def isolated_mcp_store(tmp_path, monkeypatch):
    """Every test gets its own mcp_servers.json so nothing touches the repo's real file."""
    monkeypatch.setattr(mcp_store, "MCP_CONFIG_FILE", str(tmp_path / "mcp_servers.json"))


@pytest.fixture
def no_mcp_reconnect(monkeypatch):
    """Prevent the API layer from spawning real MCP subprocesses during route tests."""
    monkeypatch.setattr(mcp_manager_instance, "connect_all", lambda servers: None)
    monkeypatch.setattr(mcp_manager_instance, "get_status", lambda: [])


@pytest.fixture
def client(isolated_mcp_store, no_mcp_reconnect):
    from app import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def authed_client(client):
    """A TestClient logged in as a freshly registered, uniquely-named user."""
    username = f"tester_{uuid.uuid4().hex[:8]}"
    resp = client.post("/register", json={"username": username, "password": "testpass123"})
    assert resp.status_code == 200, resp.text
    return client
