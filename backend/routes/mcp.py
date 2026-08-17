from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import mcp_store
from mcp_manager import manager
from utils import login_required

router = APIRouter(prefix="/mcp", tags=["mcp"])


TRANSPORTS = ("stdio", "http", "sse")
AUTH_MODES = ("none", "oauth")


class ServerBody(BaseModel):
    name: str
    transport: str = "stdio"
    command: str = ""
    args: list[str] = []
    env: dict[str, str] = {}
    url: str = ""
    headers: dict[str, str] = {}
    auth: str = "none"


class ServerUpdateBody(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    transport: Optional[str] = None
    command: Optional[str] = None
    args: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None
    url: Optional[str] = None
    headers: Optional[dict[str, str]] = None
    auth: Optional[str] = None


def _reconnect() -> None:
    manager.connect_all(mcp_store.load_mcp_servers())


@router.get("/servers")
async def list_servers(current_user: dict = Depends(login_required)):
    servers = mcp_store.load_mcp_servers()
    status_by_id = {s["server_id"]: s for s in manager.get_status()}
    return {"servers": [{**s, "status": status_by_id.get(s["id"])} for s in servers]}


@router.post("/servers")
async def create_server(body: ServerBody, current_user: dict = Depends(login_required)):
    name = body.name.strip()
    transport = body.transport if body.transport in TRANSPORTS else "stdio"
    auth = body.auth if body.auth in AUTH_MODES else "none"
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    if auth == "oauth" and transport == "stdio":
        raise HTTPException(status_code=400, detail="OAuth requires a remote transport")
    if transport == "stdio":
        command = body.command.strip()
        if not command:
            raise HTTPException(status_code=400, detail="Command required")
        server = mcp_store.add_server(name, transport, command, body.args, body.env, "", {}, auth)
    else:
        url = body.url.strip()
        if not url:
            raise HTTPException(status_code=400, detail="URL required")
        server = mcp_store.add_server(name, transport, "", [], {}, url, body.headers, auth)
    _reconnect()
    return server


@router.patch("/servers/{server_id}")
async def edit_server(
    server_id: str, body: ServerUpdateBody, current_user: dict = Depends(login_required)
):
    updates = body.model_dump(exclude_none=True)
    if "transport" in updates and updates["transport"] not in TRANSPORTS:
        raise HTTPException(status_code=400, detail="Invalid transport")
    if "auth" in updates and updates["auth"] not in AUTH_MODES:
        raise HTTPException(status_code=400, detail="Invalid auth mode")
    server = mcp_store.update_server(server_id, updates)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    _reconnect()
    return server


@router.delete("/servers/{server_id}")
async def remove_server(server_id: str, current_user: dict = Depends(login_required)):
    if not mcp_store.delete_server(server_id):
        raise HTTPException(status_code=404, detail="Server not found")
    _reconnect()
    return {"ok": True}


@router.post("/servers/{server_id}/authorize")
async def authorize_server(
    server_id: str, request: Request, current_user: dict = Depends(login_required)
):
    server = mcp_store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.get("transport") == "stdio" or server.get("auth") != "oauth":
        raise HTTPException(status_code=400, detail="Server is not configured for OAuth")
    redirect_uri = f"{str(request.base_url).rstrip('/')}/mcp/oauth/callback"
    manager.start_oauth_authorization(server, redirect_uri)
    return {"ok": True}


_CALLBACK_PAGE = """<!doctype html>
<title>{title}</title>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center;
  justify-content: center; height: 100vh; margin: 0; text-align: center; color: #333;">
  <p>{message}</p>
</body>"""


@router.get("/oauth/callback")
async def oauth_callback(
    code: str | None = None, state: str | None = None, error: str | None = None
):
    if error:
        return HTMLResponse(
            _CALLBACK_PAGE.format(
                title="Authorization failed", message=f"Authorization failed: {error}"
            )
        )
    if not code or not state:
        return HTMLResponse(
            _CALLBACK_PAGE.format(
                title="Authorization failed", message="Missing authorization code or state."
            )
        )
    if not manager.resolve_oauth_callback(state, code):
        return HTMLResponse(
            _CALLBACK_PAGE.format(
                title="Authorization expired",
                message="This authorization link is no longer valid. Go back to Settings and try again.",
            )
        )
    return HTMLResponse(
        _CALLBACK_PAGE.format(
            title="Authorized", message="Authorization complete — you can close this tab."
        )
    )
