import { useState, useRef, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { logout } from "../../api/auth";
import { saveModel, savePresets } from "../../api/config";
import type { Preset } from "../../types";

interface HeaderProps {
  onOpenSettings: (tab?: string) => void;
}

export default function Header({ onOpenSettings }: HeaderProps) {
  const { config, setConfig } = useApp();

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
    <header className="w-full px-6 py-[1.2rem] text-[1.1rem] font-semibold tracking-[0.02em] border-b border-border flex items-center justify-between flex-shrink-0 bg-bg-base">
      {/* Left: sidebar toggle + title + model dropdown */}
      <div className="flex items-center gap-[0.6rem] pl-8">
        <span className="text-txt-primary">AI Workspace</span>

        {/* Model dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((o) => !o);
            }}
            className={`flex items-center gap-[0.3rem] bg-bg-surface border border-[#2a2a2a] rounded-lg text-txt-dim cursor-pointer text-[0.78rem] font-[inherit] px-[0.55rem] py-[0.25rem] transition-all max-w-[180px] hover:text-txt-muted hover:border-[#3a3a3a] ${dropdownOpen ? "text-txt-primary border-[#3d3d3d] bg-[#222]" : ""}`}
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
            <div className="absolute top-[calc(100%+6px)] left-0 z-[120] bg-bg-surface border border-[#2d2d2d] rounded-[0.65rem] shadow-[0_8px_28px_rgba(0,0,0,0.55)] min-w-[220px] max-w-[300px] overflow-hidden">
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
                          className={`flex flex-col items-start bg-transparent border-none rounded-none text-[#ccc] cursor-pointer font-[inherit] px-[0.7rem] py-[0.45rem] text-left transition-all flex-1 min-w-0 hover:bg-[#252525] hover:text-white ${p.id === activeId ? "text-txt-primary" : ""}`}
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
                className="block w-full bg-transparent border-none border-t border-[#252525] text-txt-dim cursor-pointer font-[inherit] text-[0.78rem] px-[0.7rem] py-[0.5rem] text-left transition-all hover:text-txt-muted hover:bg-[#1f1f1f]"
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
