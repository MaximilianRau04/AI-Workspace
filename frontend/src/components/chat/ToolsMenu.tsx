import { useEffect, useRef, useState } from "react";
import type { McpServer } from "../../types";

interface ToolsMenuProps {
  webSearch: boolean;
  onToggleWebSearch: () => void;
  codeInterpreter: boolean;
  onToggleCodeInterpreter: () => void;
  mcpServers: McpServer[];
  enabledMcpServerIds: string[];
  onToggleMcpServer: (id: string) => void;
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-5 4v0a5 5 0 0 1-5-4L6 8z" />
      <path d="M12 17v5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

const itemCls =
  "w-full flex items-center gap-[0.6rem] px-3 py-[0.5rem] text-[0.85rem] text-txt-primary bg-transparent border-none cursor-pointer hover:bg-bg-muted transition-colors text-left";

export default function ToolsMenu({
  webSearch,
  onToggleWebSearch,
  codeInterpreter,
  onToggleCodeInterpreter,
  mcpServers,
  enabledMcpServerIds,
  onToggleMcpServer,
}: ToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMcpExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const anyActive =
    webSearch || codeInterpreter || enabledMcpServerIds.length > 0;

  return (
    <div className="relative flex-shrink-0" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Tools"
        className={`w-[30px] h-[30px] rounded-[0.45rem] flex items-center justify-center border-none cursor-pointer transition-all flex-shrink-0 ${
          anyActive
            ? "bg-accent/10 text-accent hover:bg-accent/15"
            : "bg-transparent text-txt-dim hover:text-txt-muted hover:bg-bg-muted"
        }`}
      >
        <PlusIcon />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[260px] bg-bg-surface border border-border rounded-[0.75rem] shadow-lg py-1 z-20 overflow-hidden">
          <button type="button" onClick={onToggleWebSearch} className={itemCls}>
            <GlobeIcon />
            <span className="flex-1">Web search</span>
            {webSearch && <CheckIcon />}
          </button>

          <button
            type="button"
            onClick={onToggleCodeInterpreter}
            className={itemCls}
          >
            <TerminalIcon />
            <span className="flex-1">Code interpreter</span>
            {codeInterpreter && <CheckIcon />}
          </button>

          <button
            type="button"
            onClick={() => setMcpExpanded((v) => !v)}
            className={itemCls}
          >
            <PlugIcon />
            <span className="flex-1">MCP servers</span>
            {enabledMcpServerIds.length > 0 && (
              <span className="text-[0.7rem] text-txt-dim tabular-nums">
                {enabledMcpServerIds.length}
              </span>
            )}
            <ChevronIcon expanded={mcpExpanded} />
          </button>

          {mcpExpanded && (
            <div className="border-t border-border pt-1 pb-[0.15rem]">
              {mcpServers.length === 0 && (
                <p className="px-3 py-2 text-[0.75rem] text-txt-dim leading-[1.4]">
                  No MCP servers configured. Add one in Settings → MCP Servers.
                </p>
              )}
              {mcpServers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggleMcpServer(s.id)}
                  disabled={!s.enabled}
                  title={
                    !s.enabled
                      ? "Disabled in Settings"
                      : s.status?.error || undefined
                  }
                  className={`${itemCls} pl-8 ${!s.enabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                      s.status?.connected ? "bg-[#2ecc71]" : "bg-[#888]"
                    }`}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {enabledMcpServerIds.includes(s.id) && <CheckIcon />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
