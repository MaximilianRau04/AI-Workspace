import { useState, useEffect } from "react";
import {
  getConfig,
  saveSystemPrompt,
  saveModel,
  savePresets,
  getOllamaModels,
} from "../../api/config";
import { useApp } from "../../context/AppContext";
import type { Preset } from "../../types";

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
  const [provider, setProvider] = useState("gemini");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [reasoning, setReasoning] = useState(false);
  const [streamDelay, setStreamDelay] = useState<string>(
    () => localStorage.getItem("streamDelay") ?? "8",
  );
  const [ollamaStatus, setOllamaStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    getConfig().then((data) => {
      setSystemPrompt(data.system_prompt || "");
      const m = data.model || {};
      setProvider(m.provider || "gemini");
      setModelName(m.model || "");
      setApiKey("");
      setBaseUrl(m.base_url || "");
      setReasoning(m.reasoning || false);
      setSuggestions(MODEL_LISTS[m.provider || "gemini"] || []);
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
            model: { ...c.model, ...entry, presets: newPresets },
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
    { id: "model", label: "Model" },
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
        <div className="flex gap-1 border-b border-[#2a2a2a] pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`bg-transparent border rounded-lg text-[0.85rem] font-medium px-[0.85rem] py-[0.35rem] cursor-pointer transition-all ${
                tab === t.id
                  ? "bg-[#2a2a2a] border-[#3a3a3a] text-txt-primary"
                  : "border-transparent text-txt-dim hover:text-[#ccc]"
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
                    className="bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg text-[#ccc] cursor-pointer text-[0.8rem] px-3 whitespace-nowrap hover:bg-[#333] hover:text-white transition-all"
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
            className="bg-[#2a2a2a] hover:bg-[#333] border-none rounded-lg text-txt-primary px-4 py-2 cursor-pointer text-[0.9rem] transition-colors"
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
