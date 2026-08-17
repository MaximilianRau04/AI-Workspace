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

Remote servers configured with auth="oauth" go through the MCP SDK's OAuth2
+ PKCE + dynamic client registration flow. That flow needs a human to visit
an authorization URL in a browser and only resumes once our OAuth callback
route delivers the resulting code, so it is never run as part of the normal
connect_all() reconnect (which is timeout-bounded and expected to finish
without user interaction) — only start_oauth_authorization() triggers it,
from a request that can supply a real redirect_uri.
"""

from __future__ import annotations

import asyncio
import os
import re
import threading
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlparse

from mcp import ClientSession, StdioServerParameters
from mcp.client.auth import OAuthClientProvider
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

import mcp_store

_NAME_RE = re.compile(r"^mcp__([0-9a-f]{8})__(.+)$")

OAUTH_CALLBACK_TIMEOUT = 300.0  # seconds to wait for the user to finish the browser consent flow


@dataclass
class _ServerConn:
    session: ClientSession
    stack: AsyncExitStack
    tools: list[dict] = field(default_factory=list)


class _StoreTokenStorage:
    """TokenStorage backed by mcp_store, so registration + tokens survive restarts."""

    def __init__(self, server_id: str) -> None:
        self.server_id = server_id

    async def get_tokens(self) -> OAuthToken | None:
        server = mcp_store.get_server(self.server_id)
        raw = server.get("oauth_tokens") if server else None
        return OAuthToken.model_validate(raw) if raw else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        mcp_store.update_server(self.server_id, {"oauth_tokens": tokens.model_dump(mode="json")})

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        server = mcp_store.get_server(self.server_id)
        raw = server.get("oauth_client_info") if server else None
        return OAuthClientInformationFull.model_validate(raw) if raw else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        mcp_store.update_server(
            self.server_id, {"oauth_client_info": client_info.model_dump(mode="json")}
        )


class McpManager:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._conns: dict[str, _ServerConn] = {}
        self._errors: dict[str, str] = {}
        self._names: dict[str, str] = {}
        self._configs: dict[str, dict] = {}
        # OAuth flows in progress: authorization URL / pending code exchange per server,
        # plus the state->server_id correlation needed to route the callback request.
        self._oauth_urls: dict[str, str] = {}
        self._oauth_pending: dict[str, asyncio.Future] = {}
        self._oauth_state_to_server: dict[str, str] = {}

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
        enabled_ids = {s["id"] for s in servers if s.get("enabled")}
        for server_id in list(self._oauth_pending.keys()):
            if server_id not in enabled_ids:
                self._cancel_oauth(server_id)
        self._errors = {}
        self._names = {s["id"]: s["name"] for s in servers}
        self._configs = {s["id"]: s for s in servers}
        for s in servers:
            if not s.get("enabled"):
                continue
            if (
                s.get("transport") != "stdio"
                and s.get("auth") == "oauth"
                and not s.get("oauth_tokens")
            ):
                # No token yet — needs a human in a browser. Handled separately by
                # start_oauth_authorization() so it can't stall this reconnect pass.
                continue
            await self._connect_one(s)

    def _build_oauth_provider(self, s: dict, redirect_uri: str | None) -> OAuthClientProvider:
        server_id = s["id"]
        metadata = OAuthClientMetadata(
            redirect_uris=[redirect_uri or "http://localhost/mcp/oauth/callback"],
            client_name="AI Workspace",
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
        )

        async def redirect_handler(url: str) -> None:
            state = parse_qs(urlparse(url).query).get("state", [None])[0]
            self._oauth_urls[server_id] = url
            if state:
                self._oauth_state_to_server[state] = server_id

        async def callback_handler() -> tuple[str, str | None]:
            fut = self._loop.create_future()
            self._oauth_pending[server_id] = fut
            try:
                return await asyncio.wait_for(fut, timeout=OAUTH_CALLBACK_TIMEOUT)
            finally:
                self._oauth_pending.pop(server_id, None)
                self._oauth_urls.pop(server_id, None)

        # Only wire up the interactive handlers when we have a real, request-derived
        # redirect_uri. Background reconnects pass none: if a stored token can't be
        # refreshed there, this fails fast with a clear error instead of ever blocking
        # on a browser flow nobody is watching.
        interactive = redirect_uri is not None
        if interactive:
            for state, sid in list(self._oauth_state_to_server.items()):
                if sid == server_id:
                    del self._oauth_state_to_server[state]

        return OAuthClientProvider(
            server_url=s["url"],
            client_metadata=metadata,
            storage=_StoreTokenStorage(server_id),
            redirect_handler=redirect_handler if interactive else None,
            callback_handler=callback_handler if interactive else None,
        )

    async def _connect_one(self, s: dict, redirect_uri: str | None = None) -> None:
        server_id = s["id"]
        stack = AsyncExitStack()
        try:
            transport = s.get("transport", "stdio")
            auth = (
                self._build_oauth_provider(s, redirect_uri)
                if transport != "stdio" and s.get("auth") == "oauth"
                else None
            )
            if transport == "http":
                read, write, _ = await stack.enter_async_context(
                    streamablehttp_client(s["url"], headers=s.get("headers") or None, auth=auth)
                )
            elif transport == "sse":
                read, write = await stack.enter_async_context(
                    sse_client(s["url"], headers=s.get("headers") or None, auth=auth)
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
            self._errors.pop(server_id, None)
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

    def _cancel_oauth(self, server_id: str) -> None:
        fut = self._oauth_pending.pop(server_id, None)
        if fut and not fut.done():
            fut.cancel()
        self._oauth_urls.pop(server_id, None)
        for state, sid in list(self._oauth_state_to_server.items()):
            if sid == server_id:
                del self._oauth_state_to_server[state]

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
    # OAuth (remote servers with auth="oauth")
    # ------------------------------------------------------------------

    def start_oauth_authorization(self, server: dict, redirect_uri: str) -> None:
        """Kick off (or restart) the interactive OAuth flow for one server.

        Runs as its own task on the MCP loop, independent of connect_all()'s
        timeout-bounded reconnect pass, since this step waits on a human
        completing a browser consent screen — which can take arbitrarily long.
        """
        server_id = server["id"]
        loop = self._ensure_loop()
        self._names[server_id] = server["name"]
        self._configs[server_id] = server
        self._errors.pop(server_id, None)

        async def _reauthorize() -> None:
            await self._disconnect(server_id)
            await self._connect_one(server, redirect_uri)

        asyncio.run_coroutine_threadsafe(_reauthorize(), loop)

    def resolve_oauth_callback(self, state: str, code: str) -> bool:
        """Deliver an authorization code from the OAuth callback route to the
        matching pending connection attempt. Returns False if `state` is unknown
        (expired, already resolved, or forged)."""
        server_id = self._oauth_state_to_server.get(state)
        if server_id is None:
            return False
        fut = self._oauth_pending.get(server_id)
        if fut is None or fut.done():
            return False
        assert self._loop is not None
        self._loop.call_soon_threadsafe(fut.set_result, (code, state))
        return True

    # ------------------------------------------------------------------
    # Status / tool listing
    # ------------------------------------------------------------------

    def get_status(self) -> list[dict]:
        status = []
        for server_id, name in self._names.items():
            conn = self._conns.get(server_id)
            cfg = self._configs.get(server_id, {})
            needs_authorization = (
                conn is None and cfg.get("transport") != "stdio" and cfg.get("auth") == "oauth"
            )
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
                    "needs_authorization": needs_authorization,
                    "authorization_url": self._oauth_urls.get(server_id),
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
