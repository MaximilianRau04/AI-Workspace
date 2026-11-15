import { useEffect, useState } from "react";
import {
  getMcpServers,
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
  authorizeMcpServer,
} from "../../api/mcp";
import { MCP_PRESETS, type McpPreset } from "../../data/mcpPresets";
import type { McpAuth, McpServer, McpTransport } from "../../types";
import { BrandIcon } from "./BrandIcon";
import { inputCls, labelCls } from "./styles";

export default function McpTab() {
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpLoaded, setMcpLoaded] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpTransport, setNewMcpTransport] = useState<McpTransport>("stdio");
  const [newMcpCommand, setNewMcpCommand] = useState("npx");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpEnv, setNewMcpEnv] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");
  const [newMcpHeaders, setNewMcpHeaders] = useState("");
  const [newMcpAuth, setNewMcpAuth] = useState<McpAuth>("none");
  const [mcpSaving, setMcpSaving] = useState(false);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [presetAdding, setPresetAdding] = useState<string | null>(null);
  const [mcpAuthorizingId, setMcpAuthorizingId] = useState<string | null>(null);
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [editMcpName, setEditMcpName] = useState("");
  const [editMcpTransport, setEditMcpTransport] =
    useState<McpTransport>("stdio");
  const [editMcpCommand, setEditMcpCommand] = useState("");
  const [editMcpArgs, setEditMcpArgs] = useState("");
  const [editMcpEnv, setEditMcpEnv] = useState("");
  const [editMcpUrl, setEditMcpUrl] = useState("");
  const [editMcpHeaders, setEditMcpHeaders] = useState("");
  const [editMcpAuth, setEditMcpAuth] = useState<McpAuth>("none");

  function reloadMcpServers(): void {
    getMcpServers().then((data) => {
      setMcpServers(data.servers || []);
      setMcpLoaded(true);
    });
  }

  useEffect(() => {
    if (!mcpLoaded) reloadMcpServers();
  }, [mcpLoaded]);

  useEffect(() => {
    const pending = mcpServers.some(
      (s) =>
        s.enabled &&
        s.auth === "oauth" &&
        !s.status?.connected &&
        !s.status?.error,
    );
    if (!pending) return;
    const interval = setInterval(reloadMcpServers, 3000);
    return () => clearInterval(interval);
  }, [mcpServers]);

  function parseMcpArgs(raw: string): string[] {
    return raw.trim() ? raw.trim().split(/\s+/) : [];
  }

  function parseKeyValueLines(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) result[key] = value;
      }
    }
    return result;
  }

  function formatKeyValueLines(values: Record<string, string>): string {
    return Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }

  function isMcpFormValid(
    transport: McpTransport,
    command: string,
    url: string,
  ): boolean {
    return transport === "stdio" ? !!command.trim() : !!url.trim();
  }

  async function handleAddMcpServer(): Promise<void> {
    const name = newMcpName.trim();
    if (!name || !isMcpFormValid(newMcpTransport, newMcpCommand, newMcpUrl))
      return;
    setMcpSaving(true);
    setMcpBusy(true);
    try {
      await addMcpServer({
        name,
        transport: newMcpTransport,
        command: newMcpCommand.trim(),
        args: parseMcpArgs(newMcpArgs),
        env: parseKeyValueLines(newMcpEnv),
        url: newMcpUrl.trim(),
        headers: parseKeyValueLines(newMcpHeaders),
        auth: newMcpTransport === "stdio" ? "none" : newMcpAuth,
      });
      setNewMcpName("");
      setNewMcpTransport("stdio");
      setNewMcpCommand("npx");
      setNewMcpArgs("");
      setNewMcpEnv("");
      setNewMcpUrl("");
      setNewMcpHeaders("");
      setNewMcpAuth("none");
      setPresetNote(null);
      reloadMcpServers();
    } finally {
      setMcpSaving(false);
      setMcpBusy(false);
    }
  }

  async function handleUsePreset(preset: McpPreset): Promise<void> {
    if (preset.autoAdd) {
      setPresetAdding(preset.id);
      setMcpBusy(true);
      try {
        await addMcpServer({
          name: preset.name,
          transport: preset.transport,
          command: preset.command || "",
          args: preset.args || [],
          env: preset.env || {},
          url: preset.url || "",
          headers: preset.headers || {},
          auth: preset.auth || "none",
        });
        reloadMcpServers();
      } finally {
        setPresetAdding(null);
        setMcpBusy(false);
      }
      return;
    }
    setNewMcpName(preset.name);
    setNewMcpTransport(preset.transport);
    setNewMcpCommand(preset.command || "npx");
    setNewMcpArgs((preset.args || []).join(" "));
    setNewMcpEnv(formatKeyValueLines(preset.env || {}));
    setNewMcpUrl(preset.url || "");
    setNewMcpHeaders(formatKeyValueLines(preset.headers || {}));
    setNewMcpAuth(preset.auth || "none");
    setPresetNote(preset.note || null);
    document
      .getElementById("mcp-add-server-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleToggleMcpServer(server: McpServer): Promise<void> {
    setMcpBusy(true);
    try {
      await updateMcpServer(server.id, { enabled: !server.enabled });
      reloadMcpServers();
    } finally {
      setMcpBusy(false);
    }
  }

  async function handleDeleteMcpServer(id: string): Promise<void> {
    setMcpBusy(true);
    try {
      await deleteMcpServer(id);
      reloadMcpServers();
    } finally {
      setMcpBusy(false);
    }
  }

  async function handleAuthorizeMcpServer(id: string): Promise<void> {
    setMcpAuthorizingId(id);
    try {
      await authorizeMcpServer(id);
      reloadMcpServers();
    } finally {
      setMcpAuthorizingId(null);
    }
  }

  function startEditMcpServer(server: McpServer): void {
    setEditingMcpId(server.id);
    setEditMcpName(server.name);
    setEditMcpTransport(server.transport);
    setEditMcpCommand(server.command);
    setEditMcpArgs(server.args.join(" "));
    setEditMcpEnv(formatKeyValueLines(server.env));
    setEditMcpUrl(server.url);
    setEditMcpHeaders(formatKeyValueLines(server.headers));
    setEditMcpAuth(server.auth);
  }

  function cancelEditMcpServer(): void {
    setEditingMcpId(null);
  }

  async function handleSaveEditMcpServer(): Promise<void> {
    if (!editingMcpId) return;
    const name = editMcpName.trim();
    if (!name || !isMcpFormValid(editMcpTransport, editMcpCommand, editMcpUrl))
      return;
    setMcpBusy(true);
    try {
      await updateMcpServer(editingMcpId, {
        name,
        transport: editMcpTransport,
        command: editMcpCommand.trim(),
        args: parseMcpArgs(editMcpArgs),
        env: parseKeyValueLines(editMcpEnv),
        url: editMcpUrl.trim(),
        headers: parseKeyValueLines(editMcpHeaders),
        auth: editMcpTransport === "stdio" ? "none" : editMcpAuth,
      });
      setEditingMcpId(null);
      reloadMcpServers();
    } finally {
      setMcpBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.75rem] text-[#555]">
        Connect MCP servers (folder access, GitHub, email, calendar…) to give
        the model new tools. Local servers run as subprocesses via{" "}
        <code>npx</code> or <code>uvx</code>; remote servers connect over HTTP
        or SSE.
      </p>

      <div className="flex flex-col gap-2">
        <label className={labelCls}>Quick add</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MCP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                void handleUsePreset(preset);
              }}
              disabled={mcpBusy}
              title={preset.note || preset.description}
              className="flex flex-col items-start gap-0.5 bg-bg-base hover:bg-bg-hover disabled:opacity-50 border border-border rounded-[0.6rem] px-3 py-2 text-left cursor-pointer transition-colors"
            >
              <span className="text-[0.85rem] text-txt-primary font-medium flex items-center gap-1.5">
                <BrandIcon
                  name={preset.icon}
                  className="w-4 h-4 flex-shrink-0 text-txt-muted"
                />
                {preset.name}
                {presetAdding === preset.id && (
                  <span className="w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </span>
              <span className="text-[0.68rem] text-txt-dim leading-snug">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mcpBusy && (
        <p className="text-[0.75rem] text-accent flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Reconnecting servers… this can take up to a minute.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {mcpServers.length === 0 && (
          <p className="text-[0.8rem] text-txt-dim">
            No MCP servers configured yet.
          </p>
        )}
        {mcpServers.map((s) =>
          editingMcpId === s.id ? (
            <div
              key={s.id}
              className="flex flex-col gap-2 bg-bg-base border border-accent rounded-[0.6rem] px-3 py-2"
            >
              <input
                type="text"
                value={editMcpName}
                onChange={(e) => setEditMcpName(e.target.value)}
                placeholder="Name, e.g. Filesystem"
                className={inputCls}
              />
              <select
                value={editMcpTransport}
                onChange={(e) =>
                  setEditMcpTransport(e.target.value as McpTransport)
                }
                className={inputCls}
              >
                <option value="stdio">Local (stdio)</option>
                <option value="http">Remote (HTTP)</option>
                <option value="sse">Remote (SSE, legacy)</option>
              </select>
              {editMcpTransport === "stdio" ? (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editMcpCommand}
                      onChange={(e) => setEditMcpCommand(e.target.value)}
                      placeholder="npx"
                      className={`${inputCls} !w-24 flex-shrink-0`}
                    />
                    <input
                      type="text"
                      value={editMcpArgs}
                      onChange={(e) => setEditMcpArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-filesystem /path/to/folder"
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                  <textarea
                    value={editMcpEnv}
                    onChange={(e) => setEditMcpEnv(e.target.value)}
                    placeholder={
                      "Optional environment variables, one per line:\nGITHUB_PERSONAL_ACCESS_TOKEN=ghp_…"
                    }
                    className="bg-bg-surface border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.85rem] leading-[1.5] px-3 py-2 resize-y min-h-[60px] outline-none focus:border-accent transition-colors placeholder:text-[#444] placeholder:font-light"
                  />
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={editMcpUrl}
                    onChange={(e) => setEditMcpUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                    className={inputCls}
                  />
                  <textarea
                    value={editMcpHeaders}
                    onChange={(e) => setEditMcpHeaders(e.target.value)}
                    placeholder={
                      "Optional HTTP headers, one per line:\nAuthorization=Bearer …"
                    }
                    className="bg-bg-surface border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.85rem] leading-[1.5] px-3 py-2 resize-y min-h-[60px] outline-none focus:border-accent transition-colors placeholder:text-[#444] placeholder:font-light"
                  />
                  <label className="flex items-center gap-2 text-[0.8rem] text-txt-primary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editMcpAuth === "oauth"}
                      onChange={(e) =>
                        setEditMcpAuth(e.target.checked ? "oauth" : "none")
                      }
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                    Sign in via OAuth
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveEditMcpServer();
                  }}
                  disabled={
                    mcpBusy ||
                    !editMcpName.trim() ||
                    !isMcpFormValid(
                      editMcpTransport,
                      editMcpCommand,
                      editMcpUrl,
                    )
                  }
                  className="bg-accent hover:bg-accent-hover disabled:opacity-50 border-none rounded-lg text-white px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
                >
                  {mcpBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditMcpServer}
                  disabled={mcpBusy}
                  className="bg-bg-muted hover:bg-bg-hover disabled:opacity-50 border border-border rounded-lg text-txt-primary px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={s.id}
              className="flex flex-col gap-1 bg-bg-base border border-border rounded-[0.6rem] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      s.status?.connected
                        ? "bg-[#2ecc71]"
                        : s.status?.error
                          ? "bg-[#e74c3c]"
                          : s.status?.needs_authorization
                            ? "bg-[#e6a23c]"
                            : "bg-[#888]"
                    }`}
                    title={
                      s.status?.error ||
                      (s.status?.connected
                        ? `Connected · ${s.status.tool_count} tool${s.status.tool_count === 1 ? "" : "s"}`
                        : s.status?.needs_authorization
                          ? "Needs authorization"
                          : "Disabled")
                    }
                  />
                  <span
                    className="text-[0.85rem] text-txt-primary font-medium truncate"
                    title={
                      s.transport === "stdio"
                        ? `${s.command} ${s.args.join(" ")}`
                        : `${s.transport} · ${s.url}`
                    }
                  >
                    {s.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => {
                      void handleToggleMcpServer(s);
                    }}
                    disabled={mcpBusy}
                    className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed"
                    title="Enabled"
                  />
                  <button
                    type="button"
                    onClick={() => startEditMcpServer(s)}
                    disabled={mcpBusy}
                    className="text-[0.72rem] text-[#888] hover:text-txt-primary disabled:opacity-50 bg-transparent border-none cursor-pointer underline transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteMcpServer(s.id);
                    }}
                    disabled={mcpBusy}
                    className="text-[0.72rem] text-[#888] hover:text-[#e74c3c] disabled:opacity-50 bg-transparent border-none cursor-pointer underline transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {s.status?.error && (
                <p className="text-[0.72rem] text-[#e74c3c]">
                  {s.status.error}
                </p>
              )}
              {s.enabled && s.auth === "oauth" && !s.status?.connected && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleAuthorizeMcpServer(s.id);
                    }}
                    disabled={mcpAuthorizingId === s.id}
                    className="self-start bg-accent hover:bg-accent-hover disabled:opacity-50 border-none rounded-lg text-white px-3 py-[0.3rem] cursor-pointer text-[0.72rem] transition-colors"
                  >
                    {mcpAuthorizingId === s.id
                      ? "Starting…"
                      : s.status?.authorization_url
                        ? "Sign in again"
                        : "Sign in"}
                  </button>
                  {s.status?.authorization_url && (
                    <a
                      href={s.status.authorization_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.72rem] text-accent underline"
                    >
                      Open sign-in page ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div
        id="mcp-add-server-form"
        className="flex flex-col gap-2 border-t border-border pt-3"
      >
        <label className={labelCls}>Add server</label>
        {presetNote && (
          <p className="text-[0.72rem] text-accent bg-accent/10 border border-accent/30 rounded-md px-2.5 py-1.5">
            {presetNote}
          </p>
        )}
        <input
          type="text"
          value={newMcpName}
          onChange={(e) => setNewMcpName(e.target.value)}
          placeholder="Name, e.g. Filesystem"
          className={inputCls}
        />
        <select
          value={newMcpTransport}
          onChange={(e) => setNewMcpTransport(e.target.value as McpTransport)}
          className={inputCls}
        >
          <option value="stdio">Local (stdio)</option>
          <option value="http">Remote (HTTP)</option>
          <option value="sse">Remote (SSE, legacy)</option>
        </select>
        {newMcpTransport === "stdio" ? (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMcpCommand}
                onChange={(e) => setNewMcpCommand(e.target.value)}
                placeholder="npx"
                className={`${inputCls} !w-24 flex-shrink-0`}
              />
              <input
                type="text"
                value={newMcpArgs}
                onChange={(e) => setNewMcpArgs(e.target.value)}
                placeholder="-y @modelcontextprotocol/server-filesystem /path/to/folder"
                className={`${inputCls} flex-1`}
              />
            </div>
            <textarea
              value={newMcpEnv}
              onChange={(e) => setNewMcpEnv(e.target.value)}
              placeholder={
                "Optional environment variables, one per line:\nGITHUB_PERSONAL_ACCESS_TOKEN=ghp_…"
              }
              className="bg-bg-base border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.85rem] leading-[1.5] px-3 py-2 resize-y min-h-[60px] outline-none focus:border-accent transition-colors placeholder:text-[#444] placeholder:font-light"
            />
          </>
        ) : (
          <>
            <input
              type="text"
              value={newMcpUrl}
              onChange={(e) => setNewMcpUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className={inputCls}
            />
            <textarea
              value={newMcpHeaders}
              onChange={(e) => setNewMcpHeaders(e.target.value)}
              placeholder={
                "Optional HTTP headers, one per line:\nAuthorization=Bearer …"
              }
              className="bg-bg-base border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.85rem] leading-[1.5] px-3 py-2 resize-y min-h-[60px] outline-none focus:border-accent transition-colors placeholder:text-[#444] placeholder:font-light"
            />
            <label className="flex items-center gap-2 text-[0.8rem] text-txt-primary cursor-pointer">
              <input
                type="checkbox"
                checked={newMcpAuth === "oauth"}
                onChange={(e) =>
                  setNewMcpAuth(e.target.checked ? "oauth" : "none")
                }
                className="w-4 h-4 accent-accent cursor-pointer"
              />
              Sign in via OAuth (instead of a static header above)
            </label>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            void handleAddMcpServer();
          }}
          disabled={
            mcpBusy ||
            !newMcpName.trim() ||
            !isMcpFormValid(newMcpTransport, newMcpCommand, newMcpUrl)
          }
          className="self-start bg-bg-muted hover:bg-bg-hover disabled:opacity-50 border border-border rounded-lg text-txt-primary px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
        >
          {mcpSaving ? "Adding…" : "Add server"}
        </button>
      </div>
    </div>
  );
}
