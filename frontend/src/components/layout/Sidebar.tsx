import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { deleteChat, pinChat, renameChat } from "../../api/chats";
import type { Session } from "../../types";

function formatDate(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr + "Z");
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en", { weekday: "short" });
  return d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

function groupSessions(sessions: Session[]): { label: string; items: Session[] }[] {
  const now = Date.now();
  const buckets: [string, Session[]][] = [
    ["Today", []],
    ["Yesterday", []],
    ["Previous 7 days", []],
    ["Previous 30 days", []],
    ["Older", []],
  ];
  for (const s of sessions) {
    const diff = Math.floor((now - new Date(s.updated_at + "Z").getTime()) / 86400000);
    if (diff < 1) buckets[0][1].push(s);
    else if (diff < 2) buckets[1][1].push(s);
    else if (diff < 7) buckets[2][1].push(s);
    else if (diff < 30) buckets[3][1].push(s);
    else buckets[4][1].push(s);
  }
  return buckets
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

function ChatSearchModal({
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
          <span className="text-txt-dim flex-shrink-0"><SearchIcon /></span>
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
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                      <path d="M12 2l2.4 6.4L21 9.3l-5 4.7 1.5 6.6L12 17l-5.5 3.6L8 14 3 9.3l6.6-.9z"/>
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
                      s.id === currentId
                        ? "bg-accent-dim"
                        : "hover:bg-bg-hover"
                    }`}
                  >
                    <span className="text-txt-dim flex-shrink-0"><ChatIcon /></span>
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

interface SessionContextMenuProps {
  sessionId: string;
  pinned: boolean;
  titleRef: React.MutableRefObject<string>;
  onClose: () => void;
  onDeleted: () => void;
  onRenamed: (newTitle: string) => void;
  onPinToggled: (pinned: boolean) => void;
  anchorEl: HTMLElement | null;
}

function SessionContextMenu({
  sessionId,
  pinned,
  titleRef,
  onClose,
  onDeleted,
  onRenamed,
  onPinToggled,
  anchorEl,
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 160;
      let left = rect.right - menuWidth;
      if (left < 4) left = 4;
      setPos({ left, top: rect.bottom + 4 });
    }
  }, [anchorEl]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("click", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  async function handleDelete(): Promise<void> {
    onClose();
    if (!confirm("Do you want to delete this chat?")) return;
    await deleteChat(sessionId);
    onDeleted();
  }

  function startRename(): void {
    setRenameVal(titleRef.current || "");
    setRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function saveRename(): Promise<void> {
    const newTitle = renameVal.trim();
    if (newTitle && newTitle !== titleRef.current) {
      await renameChat(sessionId, newTitle);
      onRenamed(newTitle);
    }
    onClose();
  }

  if (renaming) {
    return (
      <div
        ref={menuRef}
        style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 200 }}
        className="bg-bg-surface border border-border rounded-[0.55rem] p-1 shadow-[0_6px_24px_rgba(0,0,0,0.25)] min-w-[160px]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void saveRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          onBlur={() => {
            void saveRename();
          }}
          className="w-full bg-bg-muted dark:bg-[#111] border border-accent rounded-[0.3rem] text-txt-primary text-[0.875rem] px-[0.35rem] py-[0.1rem] outline-none font-[inherit]"
        />
      </div>
    );
  }

  const menuItems: {
    icon: React.ReactNode;
    label: string;
    action: () => void;
    danger?: boolean;
  }[] = [
    {
      icon: pinned ? (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="2" x2="22" y2="22" />
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14" />
          <path d="M15 9.34V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0-.56.08" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      ),
      label: pinned ? "Unpin" : "Pin",
      action: () => {
        void pinChat(sessionId, !pinned).then(() => {
          onPinToggled(!pinned);
          onClose();
        });
      },
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
        </svg>
      ),
      label: "Rename",
      action: startRename,
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      ),
      label: "Delete",
      action: () => { void handleDelete(); },
      danger: true,
    },
  ];

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 200 }}
      className="bg-bg-surface border border-border rounded-[0.55rem] p-1 shadow-[0_6px_24px_rgba(0,0,0,0.25)] min-w-[148px]"
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          onClick={(e) => {
            e.stopPropagation();
            item.action();
          }}
          className={`flex items-center gap-[0.55rem] w-full bg-transparent border-none px-3 py-2 text-left text-[0.85rem] rounded-[0.35rem] cursor-pointer transition-all ${
            item.danger
              ? "text-[#e05252] hover:bg-[#2d1515] dark:hover:bg-[#2d1515] hover:bg-red-50 hover:text-[#e05252]"
              : "text-txt-muted dark:text-[#ccc] hover:bg-bg-hover hover:text-txt-heading"
          }`}
        >
          <span className="flex-shrink-0 opacity-80">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, newTitle: string) => void;
  onPinToggled: (id: string, pinned: boolean) => void;
}

function SessionItem({
  session,
  isActive,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onSelect,
  onDeleted,
  onRenamed,
  onPinToggled,
}: SessionItemProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const titleRef = useRef<string>(session.title || "New Chat");
  const [title, setTitle] = useState<string>(session.title || "New Chat");
  const [isPinned, setIsPinned] = useState(session.pinned);

  function openMenu(
    e: React.MouseEvent<HTMLButtonElement>,
    btn: HTMLButtonElement,
  ): void {
    e.stopPropagation();
    setMenuAnchor(btn);
    onOpenMenu();
  }

  function handleRenamed(newTitle: string): void {
    setTitle(newTitle);
    titleRef.current = newTitle;
    onRenamed(session.id, newTitle);
  }

  function handlePinToggled(pinned: boolean): void {
    setIsPinned(pinned);
    onPinToggled(session.id, pinned);
  }

  return (
    <>
      <div
        onClick={() => onSelect(session.id)}
        className={`grid grid-cols-[1fr_auto_auto] items-center gap-[0.4rem] px-[0.65rem] py-[0.55rem] rounded-[0.65rem] cursor-pointer transition-all group ${
          isActive
            ? "bg-accent-dim shadow-[inset_0_0_0_1px_rgba(47,109,245,0.18)]"
            : "hover:bg-bg-hover"
        }`}
      >
        <span
          className={`text-[0.875rem] whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-[0.35rem] ${isActive ? "text-txt-primary" : "text-txt-muted dark:text-[#bbb]"}`}
        >
          {isPinned && (
            <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" className="text-accent flex-shrink-0 opacity-70">
              <path d="M12 2l2.4 6.4L21 9.3l-5 4.7 1.5 6.6L12 17l-5.5 3.6L8 14 3 9.3l6.6-.9z"/>
            </svg>
          )}
          {title}
        </span>
        <span className="text-[0.7rem] text-txt-dim whitespace-nowrap flex-shrink-0">
          {formatDate(session.updated_at)}
        </span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => openMenu(e, e.currentTarget)}
          className="bg-transparent border-none text-txt-dim cursor-pointer text-[1.1rem] leading-none px-[0.25rem] py-[0.15rem] opacity-0 group-hover:opacity-100 transition-opacity rounded-[0.3rem] hover:text-txt-primary hover:bg-bg-hover flex-shrink-0"
          title="Options"
        >
          ⋮
        </button>
      </div>

      {isMenuOpen && (
        <SessionContextMenu
          sessionId={session.id}
          pinned={isPinned}
          titleRef={titleRef}
          anchorEl={menuAnchor}
          onClose={() => { onCloseMenu(); setMenuAnchor(null); }}
          onDeleted={() => { onCloseMenu(); onDeleted(session.id); }}
          onRenamed={(newTitle) => { onCloseMenu(); handleRenamed(newTitle); }}
          onPinToggled={handlePinToggled}
        />
      )}
    </>
  );
}

interface SidebarProps {
  onOpenSettings: (tab?: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({ onOpenSettings, onNewChat }: SidebarProps) {
  const {
    user,
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    refreshSessions,
    sidebarOpen,
    toggleSidebar,
  } = useApp();
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleSelect(id: string): Promise<void> {
    if (id === currentSessionId) return;
    setCurrentSessionId(id);
    navigate(`/c/${id}`);
  }

  async function handleDeleted(id: string): Promise<void> {
    await refreshSessions();
    if (id === currentSessionId) {
      setCurrentSessionId(null);
      navigate("/");
    }
  }

  function handleRenamed(_id: string, _newTitle: string): void {
    // title updated locally in SessionItem; sessions refresh on next message
  }

  function handlePinToggled(id: string, pinned: boolean): void {
    setSessions((prev) =>
      [...prev.map((s) => (s.id === id ? { ...s, pinned } : s))].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned),
      ),
    );
  }

  return (
    <>
      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 w-[280px] h-full bg-bg-surface dark:bg-[#0e0e14] border-r border-border z-50 flex flex-col sidebar-transition ${
          sidebarOpen
            ? "translate-x-0 shadow-[4px_0_32px_rgba(0,0,0,0.3)]"
            : "-translate-x-full shadow-none"
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center px-4 py-[0.85rem] border-b border-border text-[0.72rem] font-semibold tracking-[0.07em] uppercase text-txt-dim">
          <span>Chats</span>
        </div>

        {/* New chat button */}
        <div className="px-[0.4rem] py-[0.4rem] border-b border-border">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-[0.55rem] px-[0.65rem] py-[0.55rem] bg-transparent hover:bg-bg-hover rounded-[0.65rem] text-txt-dim hover:text-txt-primary text-[0.875rem] font-medium cursor-pointer transition-all group border-none"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            New chat
          </button>
        </div>

        {/* Search trigger */}
        <div className="px-[0.5rem] pt-[0.4rem] pb-[0.25rem]">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-[0.45rem] bg-bg-muted hover:bg-bg-hover rounded-[0.6rem] px-[0.6rem] py-[0.45rem] border-none cursor-pointer transition-colors"
          >
            <span className="text-txt-dim flex-shrink-0"><SearchIcon /></span>
            <span className="flex-1 text-left text-[0.8rem] text-txt-dim">
              Search chats…
            </span>
            <kbd className="text-[0.6rem] text-txt-dim bg-bg-base border border-border rounded px-[0.35rem] py-[0.1rem] font-mono leading-none flex-shrink-0">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-[0.4rem] py-[0.25rem] flex flex-col gap-[0.15rem]">
          {!sessions.length ? (
            <div className="text-txt-dim text-[0.85rem] text-center py-8">
              No chats yet
            </div>
          ) : (() => {
            const pinned = sessions.filter((s) => s.pinned);
            const rest   = sessions.filter((s) => !s.pinned);
            const renderItem = (s: Session) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === currentSessionId}
                isMenuOpen={openMenuId === s.id}
                onOpenMenu={() => setOpenMenuId(s.id)}
                onCloseMenu={() => setOpenMenuId(null)}
                onSelect={(id) => { void handleSelect(id); }}
                onDeleted={(id) => { void handleDeleted(id); }}
                onRenamed={(id, newTitle) => { handleRenamed(id, newTitle); }}
                onPinToggled={handlePinToggled}
              />
            );
            return (
              <>
                {pinned.length > 0 && (
                  <>
                    <div className="text-[0.67rem] font-semibold tracking-[0.07em] uppercase text-txt-dim px-[0.65rem] pt-[0.4rem] pb-[0.1rem]">
                      Pinned
                    </div>
                    {pinned.map(renderItem)}
                    {rest.length > 0 && (
                      <div className="text-[0.67rem] font-semibold tracking-[0.07em] uppercase text-txt-dim px-[0.65rem] pt-[0.5rem] pb-[0.1rem]">
                        Chats
                      </div>
                    )}
                  </>
                )}
                {rest.map(renderItem)}
              </>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border gap-2">
          <div className="flex items-center gap-[0.55rem] min-w-0">
            <div className="w-7 h-7 rounded-full bg-bg-muted dark:bg-[#222] border border-border flex items-center justify-center flex-shrink-0 text-txt-dim">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="16"
                height="16"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
              </svg>
            </div>
            <span className="text-[0.8rem] text-txt-dim whitespace-nowrap overflow-hidden text-ellipsis">
              {user?.username || ""}
            </span>
          </div>
          <button
            onClick={() => onOpenSettings("model")}
            title="Settings"
            className="bg-transparent border-none text-[#999] cursor-pointer text-[1.1rem] leading-none px-[0.3rem] py-[0.2rem] rounded-[0.4rem] transition-all hover:text-txt-primary hover:bg-bg-muted flex items-center flex-shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="17"
              height="17"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </aside>

      {searchOpen && (
        <ChatSearchModal
          sessions={sessions}
          currentId={currentSessionId}
          onSelect={(id) => {
            void handleSelect(id);
            setSearchOpen(false);
          }}
          onNewChat={() => {
            onNewChat();
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}
