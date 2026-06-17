import { useState, useRef, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { logout } from "../../api/auth";
import { saveModel, savePresets } from "../../api/config";
import type { Preset } from "../../types";

interface HeaderProps {
  onOpenSettings: (tab?: string) => void;
}

export default function Header({ onOpenSettings }: HeaderProps) {
  const { config, setConfig, sidebarOpen, toggleSidebar } = useApp();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const presets: Preset[] = config?.model?.presets || [];
  const model = config?.model || {};

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  async function activatePreset(preset: Preset): Promise<void> {
    await saveModel(preset);
    setConfig((c) => (c ? { ...c, model: { ...c.model, ...preset } } : c));
    setDropdownOpen(false);
  }

  async function deletePreset(id: string): Promise<void> {
    const newPresets = presets.filter((p) => p.id !== id);
    await savePresets(newPresets);
    setConfig((c) =>
      c ? { ...c, model: { ...c.model, presets: newPresets } } : c,
    );
  }

  const modelId = config?.model?.model;

  return (
    <header className="w-full px-6 py-[1.1rem] text-[1.1rem] font-semibold border-b border-border flex items-center justify-between flex-shrink-0 bg-bg-base/80 backdrop-blur-sm">
      {/* Left: sidebar toggle + title + model dropdown */}
      <div className="flex items-center gap-[0.5rem]">
        <button
          onClick={toggleSidebar}
          title="Toggle sidebar"
          className={`w-[32px] h-[32px] rounded-[0.5rem] flex items-center justify-center border-none cursor-pointer transition-all flex-shrink-0 ${
            sidebarOpen
              ? "bg-bg-muted text-txt-primary"
              : "bg-transparent text-txt-dim hover:bg-bg-muted hover:text-txt-primary"
          }`}
        >
          <svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="1.5" width="15" height="15" rx="2.5" />
            <path d="M6.5 1.5v15" />
          </svg>
        </button>

        <span
          className="tracking-[-0.01em]"
          style={{
            background: "linear-gradient(135deg, var(--txt-heading) 20%, var(--txt-muted) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          AI Workspace
        </span>

        {/* Model dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((o) => !o);
            }}
            className={`flex items-center gap-[0.3rem] bg-bg-surface border border-border rounded-lg text-txt-dim cursor-pointer text-[0.78rem] font-[inherit] px-[0.55rem] py-[0.25rem] transition-all max-w-[180px] hover:text-txt-muted ${dropdownOpen ? "text-txt-primary bg-bg-muted dark:bg-[#222]" : ""}`}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {modelId || "—"}
            </span>
            <svg
              viewBox="0 0 10 6"
              width="9"
              height="9"
              fill="currentColor"
              className={`flex-shrink-0 opacity-50 transition-transform ${dropdownOpen ? "rotate-180 opacity-100" : ""}`}
            >
              <path d="M0 0l5 6 5-6z" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute top-[calc(100%+6px)] left-0 z-[120] bg-bg-surface border border-border rounded-[0.65rem] shadow-[0_8px_28px_rgba(0,0,0,0.25)] min-w-[220px] max-w-[300px] overflow-hidden">
              <div className="p-[0.3rem] flex flex-col gap-[0.1rem] max-h-[260px] overflow-y-auto">
                {!presets.length ? (
                  <p className="text-[0.8rem] text-txt-dim px-[0.7rem] py-[0.6rem] text-center">
                    No models saved yet.
                  </p>
                ) : (
                  presets.map((p) => {
                    const activeId = config?.model
                      ? `${config.model.provider}::${config.model.model}`
                      : "";
                    return (
                      <div
                        key={p.id}
                        className="flex items-stretch rounded-[0.45rem] overflow-hidden group"
                      >
                        <button
                          onClick={() => {
                            void activatePreset(p);
                          }}
                          className={`flex flex-col items-start bg-transparent border-none rounded-none text-txt-muted cursor-pointer font-[inherit] px-[0.7rem] py-[0.45rem] text-left transition-all flex-1 min-w-0 hover:bg-bg-hover hover:text-txt-heading ${p.id === activeId ? "text-txt-primary" : ""}`}
                        >
                          <span className="text-[0.875rem] font-medium">
                            {p.model}
                          </span>
                          <span className="text-[0.72rem] text-txt-dim mt-[0.05rem] group-hover:text-txt-muted">
                            {p.provider}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void deletePreset(p.id);
                          }}
                          className="bg-transparent border-none text-txt-dim cursor-pointer text-[0.75rem] opacity-0 group-hover:opacity-100 px-[0.55rem] transition-all hover:text-[#e05252] hover:bg-[#2a1212]"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenSettings("model");
                }}
                className="block w-full bg-transparent border-none border-t border-border text-txt-dim cursor-pointer font-[inherit] text-[0.78rem] px-[0.7rem] py-[0.5rem] text-left transition-all hover:text-txt-muted hover:bg-bg-hover"
              >
                Manage in Settings…
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: nothing here — controls are in top-right fixed */}
      <div className="flex items-center gap-3" />
    </header>
  );
}
