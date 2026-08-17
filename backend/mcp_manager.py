"""
MCP client manager.

The official MCP Python SDK is fully async (anyio/asyncio); the rest of this
codebase is synchronous (generator-based streaming, iterate_in_threadpool).
To bridge the two, a single background thread runs its own asyncio event
loop for the whole app lifetime; all MCP sessions live on that loop and stay
connected across requests. Sync callers submit coroutines via
run_coroutine_threadsafe() and block on the result.

Tools are exposed to the rest of the app as "mcp__<server_id>__<tool_name>"
so they can be mixed into the existing per-provider tool lists in llm.py
and routed back here from the shared _run_tool() dispatcher.
"""

from __future__ import annotations

import asyncio
import os
import re
import threading
from contextlib import AsyncExitStack
from dataclasses import dataclass, field

from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client

_NAME_RE = re.compile(r"^mcp__([0-9a-f]{8})__(.+)$")


@dataclass
class _ServerConn:
    session: ClientSession
    stack: AsyncExitStack
    tools: list[dict] = field(default_factory=list)


class McpManager:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._conns: dict[str, _ServerConn] = {}
        self._errors: dict[str, str] = {}
        self._names: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Background loop plumbing
    # ------------------------------------------------------------------

    def _ensure_loop(self) -> asyncio.AbstractEventLoop:
        if self._loop is not None:
            return self._loop
        ready = threading.Event()

        def _run() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop
            ready.set()
            loop.run_forever()

        self._thread = threading.Thread(target=_run, daemon=True, name="mcp-loop")
        self._thread.start()
        ready.wait()
        return self._loop

    def _run_coro(self, coro, timeout: float | None = None):
        loop = self._ensure_loop()
        return asyncio.run_coroutine_threadsafe(coro, loop).result(timeout)

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    def connect_all(self, servers: list[dict]) -> None:
        """Full refresh: disconnect everything, reconnect all enabled servers.

        Only called at app startup and after explicit config changes via the
        Settings UI, so the cost of a full reconnect is negligible and it
        sidesteps having to diff configs to detect edited command/args/env.
        """
        self._run_coro(self._connect_all(servers), timeout=60)

    async def _connect_all(self, servers: list[dict]) -> None:
        for server_id in list(self._conns.keys()):
            await self._disconnect(server_id)
        self._errors = {}
        self._names = {s["id"]: s["name"] for s in servers}
        for s in servers:
            if s.get("enabled"):
                await self._connect_one(s)

    async def _connect_one(self, s: dict) -> None:
        server_id = s["id"]
        stack = AsyncExitStack()
        try:
            transport = s.get("transport", "stdio")
            if transport == "http":
                read, write, _ = await stack.enter_async_context(
                    streamablehttp_client(s["url"], headers=s.get("headers") or None)
                )
            elif transport == "sse":
                read, write = await stack.enter_async_context(
                    sse_client(s["url"], headers=s.get("headers") or None)
                )
            else:
                env = {**os.environ, **(s.get("env") or {})}
                params = StdioServerParameters(
                    command=s["command"], args=s.get("args", []), env=env
                )
                read, write = await stack.enter_async_context(stdio_client(params))
            session = await stack.enter_async_context(ClientSession(read, write))
            await asyncio.wait_for(session.initialize(), timeout=20)
            result = await asyncio.wait_for(session.list_tools(), timeout=20)
            tools = [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema or {"type": "object", "properties": {}},
                }
                for t in result.tools
            ]
            self._conns[server_id] = _ServerConn(session=session, stack=stack, tools=tools)
        except Exception as exc:
            self._errors[server_id] = str(exc)
            await stack.aclose()

    async def _disconnect(self, server_id: str) -> None:
        conn = self._conns.pop(server_id, None)
        if conn is not None:
            try:
                await conn.stack.aclose()
            except Exception:
                pass

    def shutdown(self) -> None:
        if self._loop is None:
            return
        try:
            self._run_coro(self._disconnect_all(), timeout=15)
        except Exception:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=5)
        self._loop = None
        self._thread = None

    async def _disconnect_all(self) -> None:
        for server_id in list(self._conns.keys()):
            await self._disconnect(server_id)

    # ------------------------------------------------------------------
    # Status / tool listing
    # ------------------------------------------------------------------

    def get_status(self) -> list[dict]:
        status = []
        for server_id, name in self._names.items():
            conn = self._conns.get(server_id)
            status.append(
                {
                    "server_id": server_id,
                    "name": name,
                    "connected": conn is not None,
                    "tool_count": len(conn.tools) if conn else 0,
                    "tools": (
                        [{"name": t["name"], "description": t["description"]} for t in conn.tools]
                        if conn
                        else []
                    ),
                    "error": self._errors.get(server_id),
                }
            )
        return status

    def list_tools_cached(self, server_ids: list[str] | None = None) -> list[dict]:
        """Tools from the given connected servers (or all, if server_ids is None),
        prefixed for provider tool schemas."""
        tools = []
        for server_id, conn in self._conns.items():
            if server_ids is not None and server_id not in server_ids:
                continue
            for t in conn.tools:
                tools.append(
                    {
                        "name": f"mcp__{server_id}__{t['name']}",
                        "description": t["description"],
                        "input_schema": t["input_schema"],
                    }
                )
        return tools

    # ------------------------------------------------------------------
    # Tool calls
    # ------------------------------------------------------------------

    def call_tool_sync(self, qualified_name: str, args: dict) -> str:
        m = _NAME_RE.match(qualified_name)
        if not m:
            return f"Invalid MCP tool name: {qualified_name}"
        server_id, tool_name = m.group(1), m.group(2)
        conn = self._conns.get(server_id)
        if conn is None:
            return f"MCP server '{server_id}' is not connected."
        try:
            return self._run_coro(self._call_tool(conn, tool_name, args), timeout=60)
        except Exception as exc:
            return f"MCP tool call failed: {exc}"

    async def _call_tool(self, conn: _ServerConn, tool_name: str, args: dict) -> str:
        result = await conn.session.call_tool(tool_name, args)
        parts = [block.text for block in result.content if getattr(block, "text", None)]
        text = "\n".join(parts) if parts else "(no output)"
        if getattr(result, "isError", False):
            return f"Tool error: {text}"
        return text


manager = McpManager()
