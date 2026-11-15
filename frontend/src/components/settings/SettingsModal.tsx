import { useState, useEffect, useRef } from "react";
import {
  getConfig,
  saveSystemPrompt,
  saveModel,
  savePresets,
  saveVoiceConfig,
  saveProfile,
  clearMemory,
  getOllamaModels,
  getTtsVoices,
  saveDisplayName,
  saveAvatar,
  deleteAvatar,
} from "../../api/config";
import McpTab from "./McpTab";
import PromptsTab from "./PromptsTab";
import { inputCls, labelCls } from "./styles";
import UsageTab from "./UsageTab";
import { useApp } from "../../context/AppContext";
import type { Preset, TtsVoice } from "../../types";

function resizeImageToDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
  const { config, setConfig, theme, setTheme, user } = useApp();
  const isAdmin = !!user?.is_admin;

  const [tab, setTab] = useState(
    isAdmin || !["prompt", "model", "mcp"].includes(initialTab)
      ? initialTab
      : "profile",
  );
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

  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([]);
  const [ttsVoicesLoaded, setTtsVoicesLoaded] = useState(false);
  const [ttsLocale, setTtsLocale] = useState("de-DE");
  const [ttsVoice, setTtsVoice] = useState("de-DE-ConradNeural");
  const [ttsRate, setTtsRate] = useState("+0%");

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const backdropMouseDownRef = useRef(false);

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
      setDisplayName(data.display_name || "");
      setAvatar(data.avatar || "");
      const voice = data.tts_voice || "de-DE-ConradNeural";
      setTtsVoice(voice);
      setTtsLocale(voice.split("-").slice(0, 2).join("-"));
      setTtsRate(data.tts_rate || "+0%");
    });
    setStreamDelay(localStorage.getItem("streamDelay") ?? "8");
  }, []);

  function reloadTtsVoices(): void {
    getTtsVoices().then((data) => {
      setTtsVoices(data.voices || []);
      setTtsVoicesLoaded(true);
    });
  }

  useEffect(() => {
    if (tab === "voice" && !ttsVoicesLoaded) reloadTtsVoices();
  }, [tab, ttsVoicesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAvatarFile(file: File): Promise<void> {
    setAvatarBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 128);
      await saveAvatar(dataUrl);
      setAvatar(dataUrl);
      setConfig((c) => (c ? { ...c, avatar: dataUrl } : c));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar(): Promise<void> {
    setAvatarBusy(true);
    try {
      await deleteAvatar();
      setAvatar("");
      setConfig((c) => (c ? { ...c, avatar: "" } : c));
    } finally {
      setAvatarBusy(false);
    }
  }

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

    await saveProfile(profile);
    await saveDisplayName(displayName);
    localStorage.setItem("streamDelay", streamDelay);

    if (!isAdmin) {
      setConfig((c) => (c ? { ...c, profile, display_name: displayName } : c));
      setSaving(false);
      onClose();
      return;
    }

    await saveSystemPrompt(systemPrompt);
    await saveVoiceConfig(sttBackend, ttsVoice, ttsRate);

    const currentPresets: Preset[] = config?.model?.presets || [];
    const existingPreset = currentPresets.find(
      (p) => p.provider === provider && p.model === modelName.trim(),
    );
    // The API key input is always blank on open (it's never echoed back for
    // security), so an empty value here means "unchanged", not "clear it".
    const resolvedApiKey =
      apiKey.trim() || existingPreset?.api_key || config?.model?.api_key || "";

    const entry: Preset = {
      id: `${provider}::${modelName.trim()}`,
      provider,
      model: modelName.trim(),
      api_key: resolvedApiKey,
      base_url: baseUrl.trim(),
      reasoning,
    };

    await saveModel(entry);

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
            display_name: displayName,
            model: { ...c.model, ...entry, presets: newPresets },
            stt_backend: sttBackend,
            tts_voice: ttsVoice,
            tts_rate: ttsRate,
          }
        : c,
    );

    setApiKey("");
    setBaseUrl("");

    setSaving(false);
    onClose();
  }

  const adminTabs = ["prompt", "model", "mcp"];
  const tabs: { id: string; label: string }[] = [
    { id: "prompt", label: "System Prompt" },
    { id: "prompts", label: "Prompt Library" },
    { id: "profile", label: "Profile" },
    { id: "model", label: "Model" },
    { id: "mcp", label: "MCP Servers" },
    { id: "voice", label: "Voice & UI" },
    { id: "usage", label: "Usage" },
  ].filter((t) => isAdmin || !adminTabs.includes(t.id));

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget)
          onClose();
      }}
    >
      <div className="bg-bg-surface border border-border rounded-[1rem] p-6 w-[90%] max-w-[560px] h-[min(640px,85vh)] flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-3 flex-shrink-0">
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

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="min-h-full flex flex-col justify-center">
            {/* System Prompt tab */}
            {tab === "prompt" && (
              <div className="flex flex-col gap-3">
                <p className="text-[0.75rem] text-[#555]">
                  Baseline instructions that apply to every conversation: tone,
                  language, role, or restrictions. Sent automatically with every
                  new chat, so you don't need to repeat it in each message. For
                  multiple variants (e.g. "Code Reviewer", "Translator") use the
                  Prompt Library instead, which you can pick per chat.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Describe the bot's behavior, tone, language, restrictions…"
                  className="bg-bg-base border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.9rem] leading-[1.5] px-3 py-3 resize-y min-h-[180px] outline-none focus:border-accent transition-colors"
                />
              </div>
            )}

            {/* Prompt Library tab */}
            {tab === "prompts" && <PromptsTab />}

            {/* Profile tab */}
            {tab === "profile" && (
              <div className="flex flex-col gap-4">
                <p className="text-[0.75rem] text-[#555]">
                  How the assistant sees and addresses you. Everything below is
                  included in every conversation, so it doesn't need to be
                  re-explained each time you start a new chat.
                </p>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-full bg-bg-muted border border-border flex items-center justify-center flex-shrink-0 overflow-hidden text-txt-dim">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        width="30"
                        height="30"
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Avatar</label>
                    <div className="flex items-center gap-2">
                      <label className="bg-bg-muted hover:bg-bg-hover disabled:opacity-50 border border-border rounded-lg text-txt-primary px-3 py-[0.35rem] cursor-pointer text-[0.8rem] transition-colors">
                        {avatarBusy ? "Uploading…" : "Upload"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          disabled={avatarBusy}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleAvatarFile(file);
                          }}
                        />
                      </label>
                      {avatar && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleRemoveAvatar();
                          }}
                          disabled={avatarBusy}
                          className="text-[0.72rem] text-[#888] hover:text-[#e74c3c] disabled:opacity-50 bg-transparent border-none cursor-pointer underline transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-[0.35rem]">
                  <label className={labelCls}>What should I call you?</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Maxi"
                    maxLength={80}
                    className={inputCls}
                  />
                </div>

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
                      Facts the AI has picked up from your conversations.
                      Updated automatically every 5 turns.
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
                <p className="text-[0.75rem] text-[#555]">
                  Choose the AI provider and model used for new messages. The
                  API key is stored securely and never shown again. Leave it
                  blank to keep using the already-saved key, or a server-side
                  environment variable if one is set.
                </p>
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
            {tab === "mcp" && <McpTab />}

            {/* Voice & UI tab */}
            {tab === "voice" && (
              <div className="flex flex-col gap-5">
                <p className="text-[0.75rem] text-[#555]">
                  Personal display and interaction preferences: theme, streaming
                  speed, and voice input/output.
                </p>
                <div className="flex flex-row items-center justify-between">
                  <label className={labelCls}>Appearance</label>
                  <div className="flex items-center gap-1 bg-bg-base border border-border rounded-lg p-[0.15rem]">
                    {(
                      [
                        { id: "system", label: "System" },
                        { id: "light", label: "Light" },
                        { id: "dark", label: "Dark" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTheme(opt.id)}
                        className={`px-3 py-[0.35rem] rounded-[0.35rem] text-[0.8rem] cursor-pointer border-none transition-colors ${
                          theme === opt.id
                            ? "bg-accent text-white"
                            : "bg-transparent text-txt-dim hover:text-txt-primary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!isAdmin && (
                  <p className="text-[0.75rem] text-[#888] border-t border-border pt-4">
                    Voice output and speech-to-text are configured by an admin.
                  </p>
                )}
                {isAdmin && (
                  <>
                    <div className="flex flex-col gap-[0.35rem] border-t border-border pt-4">
                      <label className={labelCls}>Voice output (TTS)</label>
                      <div className="flex gap-2">
                        <select
                          value={ttsLocale}
                          onChange={(e) => {
                            const locale = e.target.value;
                            setTtsLocale(locale);
                            const firstForLocale = ttsVoices.find(
                              (v) => v.locale === locale,
                            );
                            if (firstForLocale)
                              setTtsVoice(firstForLocale.short_name);
                          }}
                          className={`${inputCls} flex-1`}
                        >
                          {Array.from(
                            new Map(
                              ttsVoices.map((v) => [v.locale, v.locale_name]),
                            ).entries(),
                          ).map(([locale, localeName]) => (
                            <option key={locale} value={locale}>
                              {localeName}
                            </option>
                          ))}
                        </select>
                        <select
                          value={ttsVoice}
                          onChange={(e) => setTtsVoice(e.target.value)}
                          className={`${inputCls} flex-1`}
                        >
                          {ttsVoices
                            .filter((v) => v.locale === ttsLocale)
                            .map((v) => (
                              <option key={v.short_name} value={v.short_name}>
                                {v.short_name
                                  .split("-")
                                  .pop()
                                  ?.replace("Neural", "")}{" "}
                                ({v.gender})
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="flex flex-row items-center justify-between mt-1">
                        <span className="text-[0.75rem] text-[#888]">
                          Speed
                        </span>
                        <select
                          value={ttsRate}
                          onChange={(e) => setTtsRate(e.target.value)}
                          className="bg-bg-base border border-border rounded-lg text-txt-primary font-[inherit] text-[0.875rem] px-3 py-[0.55rem] outline-none focus:border-accent transition-colors"
                        >
                          <option value="-25%">Slow</option>
                          <option value="+0%">Normal</option>
                          <option value="+25%">Fast</option>
                          <option value="+50%">Very fast</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-[0.35rem] border-t border-border pt-4">
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
                          Requires <code>openai-whisper</code> and{" "}
                          <code>ffmpeg</code> installed on the server.
                        </p>
                      )}
                    </div>
                  </>
                )}

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

            {/* Usage tab */}
            {tab === "usage" && <UsageTab isAdmin={isAdmin} />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 flex-shrink-0">
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
