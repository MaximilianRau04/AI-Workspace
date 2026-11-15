import { useState, useRef, useEffect } from "react";
import type { Session } from "../../types";
import { ChatIcon, SearchIcon } from "./SidebarIcons";
import { groupSessions } from "./sidebarUtils";

export default function ChatSearchModal({
  sessions,
  currentId,
  onSelect,
  onNewChat,
  onClose,
}: {
  sessions: Session[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered = query.trim()
    ? sessions.filter((s) =>
        (s.title || "New Chat").toLowerCase().includes(query.toLowerCase()),
      )
    : sessions;

  const pinnedItems = filtered.filter((s) => s.pinned);
  const unpinnedItems = filtered.filter((s) => !s.pinned);
  const groups = groupSessions(unpinnedItems);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center z-[200] pt-[12vh] backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-surface border border-border rounded-[1rem] w-[90%] max-w-[520px] flex flex-col overflow-hidden shadow-[0_20px_72px_rgba(0,0,0,0.45)] max-h-[65vh]">
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-[0.75rem] border-b border-border flex-shrink-0">
          <span className="text-txt-dim flex-shrink-0">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent border-none outline-none text-txt-primary text-[0.95rem] font-[inherit] placeholder:text-txt-dim"
          />
          <button
            onClick={onClose}
            className="text-txt-dim hover:text-txt-primary bg-transparent border-none cursor-pointer p-1 rounded-[0.4rem] transition-colors flex-shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-[0.4rem]">
          {/* New chat */}
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-[0.65rem] px-3 py-[0.6rem] rounded-[0.65rem] bg-transparent border-none cursor-pointer hover:bg-bg-hover transition-colors text-left mb-[0.25rem]"
          >
            <span className="text-txt-dim flex-shrink-0">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </span>
            <span className="text-txt-muted text-[0.875rem]">New chat</span>
          </button>

          {/* Pinned */}
          {pinnedItems.length > 0 && (
            <div className="mb-[0.6rem]">
              <div className="text-[0.67rem] font-semibold tracking-[0.07em] uppercase text-txt-dim px-3 py-[0.3rem]">
                Pinned
              </div>
              {pinnedItems.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`w-full flex items-center gap-[0.65rem] px-3 py-[0.55rem] rounded-[0.65rem] bg-transparent border-none cursor-pointer text-left transition-colors ${
                    s.id === currentId ? "bg-accent-dim" : "hover:bg-bg-hover"
                  }`}
                >
                  <span className="text-accent opacity-70 flex-shrink-0">
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      fill="currentColor"
                    >
                      <path d="M12 2l2.4 6.4L21 9.3l-5 4.7 1.5 6.6L12 17l-5.5 3.6L8 14 3 9.3l6.6-.9z" />
                    </svg>
                  </span>
                  <span className="text-txt-muted text-[0.875rem] whitespace-nowrap overflow-hidden text-ellipsis">
                    {s.title || "New Chat"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Grouped list */}
          {groups.length === 0 && pinnedItems.length === 0 ? (
            <div className="text-txt-dim text-[0.85rem] text-center py-8">
              No results
            </div>
          ) : groups.length > 0 ? (
            groups.map(({ label, items }) => (
              <div key={label} className="mb-[0.6rem]">
                <div className="text-[0.67rem] font-semibold tracking-[0.07em] uppercase text-txt-dim px-3 py-[0.3rem]">
                  {label}
                </div>
                {items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className={`w-full flex items-center gap-[0.65rem] px-3 py-[0.55rem] rounded-[0.65rem] bg-transparent border-none cursor-pointer text-left transition-colors ${
                      s.id === currentId ? "bg-accent-dim" : "hover:bg-bg-hover"
                    }`}
                  >
                    <span className="text-txt-dim flex-shrink-0">
                      <ChatIcon />
                    </span>
                    <span className="text-txt-muted text-[0.875rem] whitespace-nowrap overflow-hidden text-ellipsis">
                      {s.title || "New Chat"}
                    </span>
                  </button>
                ))}
              </div>
            ))
          ) : null}
        </div>
      </div>
    </div>
  );
}
