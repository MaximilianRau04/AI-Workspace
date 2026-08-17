import { useState, useEffect } from "react";
import {
  getConfig,
  saveSystemPrompt,
  saveModel,
  savePresets,
  saveVoiceConfig,
  saveProfile,
  clearMemory,
  getOllamaModels,
} from "../../api/config";
import {
  getMcpServers,
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
} from "../../api/mcp";
import { useApp } from "../../context/AppContext";
import type { Preset, McpServer, McpTransport } from "../../types";

const MODEL_LISTS: Record<string, string[]> = {
  gemini: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
  openai: [
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o4-mini",
    "o3",
    "o3-mini",
    "llama3.3:70b",
    "llama3.2:3b",
    "llama3.1:8b",
    "mistral:7b",
    "mixtral:8x7b",
    "gemma3:27b",
    "gemma3:12b",
    "gemma3:4b",
    "phi4:14b",
    "phi4-mini:3.8b",
    "deepseek-r1:70b",
    "deepseek-r1:32b",
    "deepseek-r1:14b",
    "deepseek-r1:7b",
    "qwq:32b",
    "devstral:24b",
    "qwen2.5-coder:32b",
    "qwen2.5-coder:7b",
    "qwen3:32b",
    "qwen3:14b",
    "qwen3:8b",
    "qwen3:4b",
  ],
  anthropic: [
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
  ],
};

interface SettingsModalProps {
  initialTab?: string;
  onClose: () => void;
}

export default function SettingsModal({
  initialTab = "model",
  onClose,
}: SettingsModalProps) {
  const { config, setConfig } = useApp();

  const [tab, setTab] = useState(initialTab);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [profile, setProfile] = useState("");
  const [memory, setMemory] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [reasoning, setReasoning] = useState(false);
  const [sttBackend, setSttBackend] = useState("google");
  const [streamDelay, setStreamDelay] = useState<string>(
    () => localStorage.getItem("streamDelay") ?? "8",
  );
  const [ollamaStatus, setOllamaStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpLoaded, setMcpLoaded] = useState(false);
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpTransport, setNewMcpTransport] = useState<McpTransport>("stdio");
  const [newMcpCommand, setNewMcpCommand] = useState("npx");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpEnv, setNewMcpEnv] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");
  const [newMcpHeaders, setNewMcpHeaders] = useState("");
  const [mcpSaving, setMcpSaving] = useState(false);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null);
  const [editMcpName, setEditMcpName] = useState("");
  const [editMcpTransport, setEditMcpTransport] =
    useState<McpTransport>("stdio");
  const [editMcpCommand, setEditMcpCommand] = useState("");
  const [editMcpArgs, setEditMcpArgs] = useState("");
  const [editMcpEnv, setEditMcpEnv] = useState("");
  const [editMcpUrl, setEditMcpUrl] = useState("");
  const [editMcpHeaders, setEditMcpHeaders] = useState("");

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  function reloadMcpServers(): void {
    getMcpServers().then((data) => {
      setMcpServers(data.servers || []);
      setMcpLoaded(true);
    });
  }

  useEffect(() => {
    if (tab === "mcp" && !mcpLoaded) reloadMcpServers();
  }, [tab, mcpLoaded]);

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
      });
      setNewMcpName("");
      setNewMcpTransport("stdio");
      setNewMcpCommand("npx");
      setNewMcpArgs("");
      setNewMcpEnv("");
      setNewMcpUrl("");
      setNewMcpHeaders("");
      reloadMcpServers();
    } finally {
      setMcpSaving(false);
      setMcpBusy(false);
    }
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

  function startEditMcpServer(server: McpServer): void {
    setEditingMcpId(server.id);
    setEditMcpName(server.name);
    setEditMcpTransport(server.transport);
    setEditMcpCommand(server.command);
    setEditMcpArgs(server.args.join(" "));
    setEditMcpEnv(formatKeyValueLines(server.env));
    setEditMcpUrl(server.url);
    setEditMcpHeaders(formatKeyValueLines(server.headers));
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
      });
      setEditingMcpId(null);
      reloadMcpServers();
    } finally {
      setMcpBusy(false);
    }
  }

  useEffect(() => {
    getConfig().then((data) => {
      setSystemPrompt(data.system_prompt || "");
      setProfile(data.profile || "");
      setMemory(data.memory || "");
      const m = data.model || {};
      setProvider(m.provider || "gemini");
      setModelName(m.model || "");
      setApiKey("");
      setBaseUrl(m.base_url || "");
      setReasoning(m.reasoning || false);
      setSuggestions(MODEL_LISTS[m.provider || "gemini"] || []);
      setSttBackend(data.stt_backend || "google");
    });
    setStreamDelay(localStorage.getItem("streamDelay") ?? "8");
  }, []);

  function handleProviderChange(p: string): void {
    setProvider(p);
    setSuggestions(MODEL_LISTS[p] || []);
    setModelName(MODEL_LISTS[p]?.[0] ?? "");
  }

  async function detectOllama(): Promise<void> {
    setOllamaStatus("Detecting…");
    const url = baseUrl.trim() || "http://localhost:11434/v1";
    try {
      const data = await getOllamaModels(url);
      if (data.error) throw new Error(data.error);
      const extra = data.models.filter((m) => !suggestions.includes(m));
      if (extra.length) setSuggestions((prev) => [...prev, ...extra]);
      if (data.models.length) {
        setModelName(data.models[0]);
        setOllamaStatus(`✓ ${data.models.length} found`);
      } else {
        setOllamaStatus("None found");
      }
    } catch {
      setOllamaStatus("Failed");
    }
    setTimeout(() => setOllamaStatus(""), 3000);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);

    await saveSystemPrompt(systemPrompt);
    await saveProfile(profile);
    await saveVoiceConfig(sttBackend);

    const entry: Preset = {
      id: `${provider}::${modelName.trim()}`,
      provider,
      model: modelName.trim(),
      api_key: apiKey.trim(),
      base_url: baseUrl.trim(),
      reasoning,
    };

    await saveModel(entry);

    const currentPresets: Preset[] = config?.model?.presets || [];
    const idx = currentPresets.findIndex(
      (p) => p.provider === entry.provider && p.model === entry.model,
    );
    let newPresets: Preset[];
    if (idx >= 0) {
      newPresets = currentPresets.map((p, i) => (i === idx ? entry : p));
    } else {
      newPresets = [...currentPresets, entry];
    }

    await savePresets(newPresets);
    localStorage.setItem("streamDelay", streamDelay);

    setConfig((c) =>
      c
        ? {
            ...c,
            system_prompt: systemPrompt,
            profile,
            model: { ...c.model, ...entry, presets: newPresets },
            stt_backend: sttBackend,
          }
        : c,
    );

    setApiKey("");
    setBaseUrl("");

    setSaving(false);
    onClose();
  }

  const inputCls =
    "bg-bg-base border border-border rounded-lg text-txt-primary font-[inherit] text-[0.875rem] px-3 py-[0.55rem] outline-none w-full focus:border-accent transition-colors";
  const labelCls = "text-[0.8rem] text-[#888] font-medium";

  const tabs: { id: string; label: string }[] = [
    { id: "prompt", label: "System Prompt" },
    { id: "profile", label: "Profile" },
    { id: "model", label: "Model" },
    { id: "mcp", label: "MCP Servers" },
    { id: "voice", label: "Voice" },
    { id: "ui", label: "UI" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-surface border border-border rounded-[1rem] p-6 w-[90%] max-w-[560px] flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`bg-transparent border rounded-lg text-[0.85rem] font-medium px-[0.85rem] py-[0.35rem] cursor-pointer transition-all ${
                tab === t.id
                  ? "bg-bg-muted border-border text-txt-primary"
                  : "border-transparent text-txt-dim hover:text-txt-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* System Prompt tab */}
        {tab === "prompt" && (
          <div className="flex flex-col gap-3">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Describe the bot's behavior, tone, language, restrictions…"
              className="bg-bg-base border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.9rem] leading-[1.5] px-3 py-3 resize-y min-h-[180px] outline-none focus:border-accent transition-colors"
            />
          </div>
        )}

        {/* Profile tab */}
        {tab === "profile" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-[0.35rem]">
              <label className={labelCls}>About you</label>
              <p className="text-[0.75rem] text-[#555]">
                Tell the AI who you are - profession, interests, preferred
                language, technical level… It will use this in every
                conversation.
              </p>
              <textarea
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="e.g. I'm a Python developer working on machine learning projects. I prefer concise answers and code examples over long explanations."
                className="bg-bg-base border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.9rem] leading-[1.5] px-3 py-3 resize-y min-h-[140px] outline-none focus:border-accent transition-colors placeholder:text-[#444] placeholder:font-light"
              />
            </div>

            {memory && (
              <div className="flex flex-col gap-[0.35rem]">
                <div className="flex items-center justify-between">
                  <label className={labelCls}>Learned memory</label>
                  <button
                    type="button"
                    onClick={() => {
                      void clearMemory().then(() => setMemory(""));
                    }}
                    className="text-[0.72rem] text-[#666] hover:text-txt-primary bg-transparent border-none cursor-pointer underline transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <p className="text-[0.75rem] text-[#555]">
                  Facts the AI has picked up from your conversations. Updated
                  automatically every 5 turns.
                </p>
                <div className="bg-bg-base border border-border rounded-[0.6rem] text-txt-muted text-[0.85rem] leading-[1.5] px-3 py-3 whitespace-pre-wrap">
                  {memory}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Model tab */}
        {tab === "model" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-[0.35rem]">
              <label className={labelCls}>Provider</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className={inputCls}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">
                  OpenAI / Compatible (Ollama, LM Studio…)
                </option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </div>

            <div className="flex flex-col gap-[0.35rem]">
              <label className={labelCls}>Model</label>
              <input
                type="text"
                list="model-sugg"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g. gemini-2.5-flash"
                autoComplete="off"
                className={inputCls}
              />
              <datalist id="model-sugg">
                {suggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-col gap-[0.35rem]">
              <label className={labelCls}>
                API Key{" "}
                <span className="font-normal text-[#555] text-[0.75rem]">
                  (leave empty to use environment variable)
                </span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="new-password"
                className={inputCls}
              />
            </div>

            {provider === "openai" && (
              <div className="flex flex-col gap-[0.35rem]">
                <label className={labelCls}>
                  Base URL{" "}
                  <span className="font-normal text-[#555] text-[0.75rem]">
                    (for Ollama: http://localhost:11434/v1)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void detectOllama();
                    }}
                    className="bg-bg-muted border border-border rounded-lg text-txt-muted cursor-pointer text-[0.8rem] px-3 whitespace-nowrap hover:bg-bg-hover hover:text-txt-heading transition-all"
                  >
                    {ollamaStatus || "Detect models"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-row items-center justify-between gap-3">
              <label className={`${labelCls} flex-1`}>
                Reasoning{" "}
                <span className="font-normal text-[#555] text-[0.75rem]">
                  (extended thinking for claude-3-7-sonnet &amp; gemini-2.5;
                  tag-parsing for deepseek-r1/qwq; chain-of-thought for all
                  others)
                </span>
              </label>
              <input
                type="checkbox"
                checked={reasoning}
                onChange={(e) => setReasoning(e.target.checked)}
                className="w-4 h-4 flex-shrink-0 accent-accent cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* MCP Servers tab */}
        {tab === "mcp" && (
          <div className="flex flex-col gap-4">
            <p className="text-[0.75rem] text-[#555]">
              Connect MCP servers (folder access, GitHub, email, calendar…) to
              give the model new tools. Local servers run as subprocesses via{" "}
              <code>npx</code> or <code>uvx</code>; remote servers connect over
              HTTP or SSE.
            </p>

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
                                : "bg-[#888]"
                          }`}
                          title={
                            s.status?.error ||
                            (s.status?.connected ? "Connected" : "Disabled")
                          }
                        />
                        <span className="text-[0.85rem] text-txt-primary font-medium truncate">
                          {s.name}
                        </span>
                        <span className="text-[0.72rem] text-txt-dim truncate">
                          {s.transport === "stdio"
                            ? `${s.command} ${s.args.join(" ")}`
                            : `${s.transport} · ${s.url}`}
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
                    {s.status?.connected && s.status.tool_count > 0 && (
                      <p className="text-[0.72rem] text-txt-dim">
                        {s.status.tool_count} tool
                        {s.status.tool_count === 1 ? "" : "s"}:{" "}
                        {s.status.tools.map((t) => t.name).join(", ")}
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <label className={labelCls}>Add server</label>
              <input
                type="text"
                value={newMcpName}
                onChange={(e) => setNewMcpName(e.target.value)}
                placeholder="Name, e.g. Filesystem"
                className={inputCls}
              />
              <select
                value={newMcpTransport}
                onChange={(e) =>
                  setNewMcpTransport(e.target.value as McpTransport)
                }
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
        )}

        {/* Voice tab */}
        {tab === "voice" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-[0.35rem]">
              <label className={labelCls}>Speech-to-Text backend</label>
              <select
                value={sttBackend}
                onChange={(e) => setSttBackend(e.target.value)}
                className={inputCls}
              >
                <option value="google">
                  Google (online, no install required)
                </option>
                <option value="whisper">
                  Whisper (local, privacy-friendly)
                </option>
              </select>
              {sttBackend === "whisper" && (
                <p className="text-[0.75rem] text-[#888] mt-1">
                  Requires <code>openai-whisper</code> and <code>ffmpeg</code>{" "}
                  installed on the server.
                </p>
              )}
            </div>
          </div>
        )}

        {/* UI tab */}
        {tab === "ui" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-row items-center justify-between">
              <label className={labelCls}>Streaming speed</label>
              <select
                value={streamDelay}
                onChange={(e) => setStreamDelay(e.target.value)}
                className="bg-bg-base border border-border rounded-lg text-txt-primary font-[inherit] text-[0.875rem] px-3 py-[0.55rem] outline-none focus:border-accent transition-colors"
              >
                <option value="0">Instant</option>
                <option value="4">Fast</option>
                <option value="8">Normal</option>
                <option value="20">Slow</option>
              </select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-bg-muted hover:bg-bg-hover border-none rounded-lg text-txt-primary px-4 py-2 cursor-pointer text-[0.9rem] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
            className="bg-accent hover:bg-accent-hover disabled:opacity-60 border-none rounded-lg text-white px-4 py-2 cursor-pointer text-[0.9rem] transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
