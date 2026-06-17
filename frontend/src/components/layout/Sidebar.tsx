import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { deleteChat, renameChat } from "../../api/chats";
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

interface SessionContextMenuProps {
  sessionId: string;
  titleRef: React.MutableRefObject<string>;
  onClose: () => void;
  onDeleted: () => void;
  onRenamed: (newTitle: string) => void;
  anchorEl: HTMLElement | null;
}

function SessionContextMenu({
  sessionId,
  titleRef,
  onClose,
  onDeleted,
  onRenamed,
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
    icon: string;
    label: string;
    action: () => void;
    danger?: boolean;
  }[] = [
    { icon: "✎", label: "Rename", action: startRename },
    {
      icon: "✕",
      label: "Delete",
      action: () => {
        void handleDelete();
      },
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
          className={`block w-full bg-transparent border-none px-3 py-2 text-left text-[0.85rem] rounded-[0.35rem] cursor-pointer transition-all ${
            item.danger
              ? "text-[#e05252] hover:bg-[#2d1515] dark:hover:bg-[#2d1515] hover:bg-red-50 hover:text-[#e05252]"
              : "text-txt-muted dark:text-[#ccc] hover:bg-bg-hover hover:text-txt-heading"
          }`}
        >
          <span className="inline-block w-[1.3rem] text-[0.85rem] opacity-85">
            {item.icon}
          </span>
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
}: SessionItemProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const titleRef = useRef<string>(session.title || "New Chat");
  const [title, setTitle] = useState<string>(session.title || "New Chat");

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
          className={`text-[0.875rem] whitespace-nowrap overflow-hidden text-ellipsis ${isActive ? "text-txt-primary" : "text-txt-muted dark:text-[#bbb]"}`}
        >
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
          titleRef={titleRef}
          anchorEl={menuAnchor}
          onClose={() => {
            onCloseMenu();
            setMenuAnchor(null);
          }}
          onDeleted={() => {
            onCloseMenu();
            onDeleted(session.id);
          }}
          onRenamed={(newTitle) => {
            onCloseMenu();
            handleRenamed(newTitle);
          }}
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
    currentSessionId,
    setCurrentSessionId,
    refreshSessions,
    sidebarOpen,
    toggleSidebar,
  } = useApp();
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

        {/* Search */}
        <div className="px-[0.5rem] pt-[0.4rem] pb-[0.25rem]">
          <div className="flex items-center gap-[0.45rem] bg-bg-muted rounded-[0.6rem] px-[0.6rem] py-[0.45rem]">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-txt-dim flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats…"
              className="flex-1 bg-transparent border-none outline-none text-[0.8rem] text-txt-primary placeholder:text-txt-dim font-[inherit] min-w-0"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-txt-dim hover:text-txt-muted border-none bg-transparent cursor-pointer leading-none flex-shrink-0 p-0"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-[0.4rem] py-[0.25rem] flex flex-col gap-[0.15rem]">
          {!sessions.length ? (
            <div className="text-txt-dim text-[0.85rem] text-center py-8">
              No chats yet
            </div>
          ) : (() => {
            const filtered = sessions.filter((s) =>
              (s.title || "New Chat").toLowerCase().includes(search.toLowerCase())
            );
            return filtered.length === 0 ? (
              <div className="text-txt-dim text-[0.82rem] text-center py-6">
                No results
              </div>
            ) : filtered.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === currentSessionId}
                isMenuOpen={openMenuId === s.id}
                onOpenMenu={() => setOpenMenuId(s.id)}
                onCloseMenu={() => setOpenMenuId(null)}
                onSelect={(id) => {
                  void handleSelect(id);
                }}
                onDeleted={(id) => {
                  void handleDeleted(id);
                }}
                onRenamed={(id, newTitle) => {
                  void handleRenamed(id, newTitle);
                }}
              />
            ));
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
    </>
  );
}
