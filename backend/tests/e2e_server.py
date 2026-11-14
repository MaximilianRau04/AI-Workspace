"""Starts the backend for Playwright E2E tests against throwaway data.

Uses a temporary database and temporary config files so the real chatbot.db,
model_config.json, mcp_servers.json and system_prompt.txt are never touched.
Serves the production build from dist/ (run `npm run build` first).
"""

import os
import sys
import tempfile

_tmp = tempfile.mkdtemp(prefix="ai-workspace-e2e-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp, 'e2e.db')}"
os.environ["SECRET_KEY"] = "e2e-secret-key-0123456789abcdef"
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("CODE_EXECUTOR_URL", None)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn  # noqa: E402

import llm  # noqa: E402
import mcp_store  # noqa: E402
from routes import config as config_routes  # noqa: E402

llm.CONFIG_FILE = os.path.join(_tmp, "model_config.json")
mcp_store.MCP_CONFIG_FILE = os.path.join(_tmp, "mcp_servers.json")
config_routes.SYSTEM_PROMPT_FILE = os.path.join(_tmp, "system_prompt.txt")

from app import app  # noqa: E402

if __name__ == "__main__":
    port = int(os.getenv("E2E_PORT", "5055"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
