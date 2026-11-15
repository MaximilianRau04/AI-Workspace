import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { logout } from "../../api/auth";
import type { Session } from "../../types";
import ChatSearchModal from "./ChatSearchModal";
import SessionItem from "./SessionItem";
import { SearchIcon } from "./SidebarIcons";

interface SidebarProps {
  onOpenSettings: (tab?: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({ onOpenSettings, onNewChat }: SidebarProps) {
  const {
    user,
    sessions,
    setSessions,
    folders,
    currentSessionId,
    setCurrentSessionId,
    refreshSessions,
    sidebarOpen,
    config,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const onFoldersPage = location.pathname.startsWith("/folders");

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

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

  async function handleLogout(): Promise<void> {
    await logout();
    window.location.href = "/login";
  }

  async function handleDeleted(id: string): Promise<void> {
    await refreshSessions();
    if (id === currentSessionId) {
      setCurrentSessionId(null);
      navigate("/");
    }
  }

  function handleRenamed(_id: string, _newTitle: string): void {}

  function handlePinToggled(id: string, pinned: boolean): void {
    setSessions((prev) =>
      [...prev.map((s) => (s.id === id ? { ...s, pinned } : s))].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned),
      ),
    );
  }

  function handleMoved(chatId: string, folderId: string | null): void {
    setSessions((prev) =>
      prev.map((s) => (s.id === chatId ? { ...s, folder_id: folderId } : s)),
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
        <div className="flex items-center px-4 py-[0.85rem] border-b border-border">
          <span className="text-[0.72rem] font-semibold tracking-[0.07em] uppercase text-txt-dim">
            Chats
          </span>
        </div>

        {/* New chat + Folders buttons */}
        <div className="px-[0.4rem] py-[0.4rem] border-b border-border flex flex-col gap-[0.1rem]">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-[0.55rem] px-[0.65rem] py-[0.55rem] bg-transparent hover:bg-bg-hover rounded-[0.65rem] text-txt-dim hover:text-txt-primary text-[0.875rem] font-medium cursor-pointer transition-all border-none"
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
          <button
            onClick={() => navigate("/folders")}
            className={`w-full flex items-center gap-[0.55rem] px-[0.65rem] py-[0.55rem] rounded-[0.65rem] text-[0.875rem] font-medium cursor-pointer transition-all border-none ${
              onFoldersPage
                ? "bg-accent-dim text-txt-primary"
                : "bg-transparent hover:bg-bg-hover text-txt-dim hover:text-txt-primary"
            }`}
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
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Folders
          </button>
        </div>

        {/* Search trigger */}
        <div className="px-[0.5rem] pt-[0.4rem] pb-[0.25rem]">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-[0.45rem] bg-bg-muted hover:bg-bg-hover rounded-[0.6rem] px-[0.6rem] py-[0.45rem] border-none cursor-pointer transition-colors"
          >
            <span className="text-txt-dim flex-shrink-0">
              <SearchIcon />
            </span>
            <span className="flex-1 text-left text-[0.8rem] text-txt-dim">
              Search chats…
            </span>
            <kbd className="text-[0.6rem] text-txt-dim bg-bg-base border border-border rounded px-[0.35rem] py-[0.1rem] font-mono leading-none flex-shrink-0">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Chat list — pinned + ungrouped only */}
        <div className="flex-1 overflow-y-auto px-[0.4rem] py-[0.25rem] flex flex-col gap-[0.1rem]">
          {(() => {
            const pinned = sessions.filter((s) => s.pinned);
            const ungrouped = sessions.filter((s) => !s.pinned);
            const sessionItem = (s: Session) => (
              <SessionItem
                key={s.id}
                session={s}
                folders={folders}
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
                onRenamed={handleRenamed}
                onPinToggled={handlePinToggled}
                onMoved={handleMoved}
              />
            );
            return (
              <>
                {pinned.length > 0 && (
                  <>
                    <div className="text-[0.67rem] font-semibold tracking-[0.07em] uppercase text-txt-dim px-[0.65rem] pt-[0.4rem] pb-[0.1rem]">
                      Pinned
                    </div>
                    {pinned.map(sessionItem)}
                  </>
                )}
                {ungrouped.length > 0 && (
                  <>
                    {pinned.length > 0 && (
                      <div className="text-[0.67rem] font-semibold tracking-[0.07em] uppercase text-txt-dim px-[0.65rem] pt-[0.3rem] pb-[0.1rem]">
                        Chats
                      </div>
                    )}
                    {ungrouped.map(sessionItem)}
                  </>
                )}
                {sessions.length === 0 && (
                  <div className="text-txt-dim text-[0.85rem] text-center py-8">
                    No chats yet
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Footer */}
        <div
          className="relative px-4 py-3 border-t border-border"
          ref={accountMenuRef}
        >
          {accountMenuOpen && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-bg-surface border border-border rounded-[0.75rem] shadow-lg py-1 z-20 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onOpenSettings("model");
                }}
                className="w-full flex items-center gap-[0.6rem] px-3 py-[0.5rem] text-[0.85rem] text-txt-primary bg-transparent border-none cursor-pointer hover:bg-bg-muted transition-colors text-left"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void handleLogout();
                }}
                className="w-full flex items-center gap-[0.6rem] px-3 py-[0.5rem] text-[0.85rem] text-txt-primary bg-transparent border-none cursor-pointer hover:bg-[#2a1010] hover:text-[#e74c3c] transition-colors text-left"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAccountMenuOpen((v) => !v)}
            className="w-full flex items-center gap-[0.55rem] min-w-0 bg-transparent border-none cursor-pointer px-1 py-1 -mx-1 rounded-[0.5rem] hover:bg-bg-muted transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-bg-muted dark:bg-[#222] border border-border flex items-center justify-center flex-shrink-0 text-txt-dim overflow-hidden">
              {config?.avatar ? (
                <img
                  src={config.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="16"
                  height="16"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" />
                </svg>
              )}
            </div>
            <span className="text-[0.8rem] text-txt-dim whitespace-nowrap overflow-hidden text-ellipsis">
              {config?.display_name || user?.username || ""}
            </span>
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
