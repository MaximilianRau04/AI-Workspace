from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import mcp_store
from mcp_manager import manager
from utils import login_required

router = APIRouter(prefix="/mcp", tags=["mcp"])


class ServerBody(BaseModel):
    name: str
    command: str
    args: list[str] = []
    env: dict[str, str] = {}


class ServerUpdateBody(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    command: Optional[str] = None
    args: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None


def _reconnect() -> None:
    manager.connect_all(mcp_store.load_mcp_servers())


@router.get("/servers")
async def list_servers(current_user: dict = Depends(login_required)):
    servers = mcp_store.load_mcp_servers()
    status_by_id = {s["server_id"]: s for s in manager.get_status()}
    return {
        "servers": [
            {**s, "status": status_by_id.get(s["id"])}
            for s in servers
        ]
    }


@router.post("/servers")
async def create_server(body: ServerBody, current_user: dict = Depends(login_required)):
    name = body.name.strip()
    command = body.command.strip()
    if not name or not command:
        raise HTTPException(status_code=400, detail="Name and command required")
    server = mcp_store.add_server(name, command, body.args, body.env)
    _reconnect()
    return server


@router.patch("/servers/{server_id}")
async def edit_server(
    server_id: str, body: ServerUpdateBody, current_user: dict = Depends(login_required)
):
    updates = body.model_dump(exclude_none=True)
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
