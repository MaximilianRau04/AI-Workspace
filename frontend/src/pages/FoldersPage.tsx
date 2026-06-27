import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Sidebar from "../components/layout/Sidebar";
import SettingsModal from "../components/settings/SettingsModal";
import {
  createFolder,
  deleteFolder,
  renameFolder,
  getFolderDocs,
  uploadFolderDoc,
  deleteFolderDoc,
} from "../api/folders";
import type { Folder, Session } from "../types";

function formatDate(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr + "Z");
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

function CreateFolderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (folder: Folder) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    const folder = (await createFolder(trimmed)) as Folder;
    onCreated(folder);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[300]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-surface border border-border rounded-[1rem] w-[440px] shadow-[0_24px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-[1rem] font-semibold text-txt-primary">
            Create folder
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="bg-transparent border-none text-txt-dim hover:text-txt-primary cursor-pointer p-[0.3rem] rounded-[0.4rem] hover:bg-bg-hover transition-colors flex items-center"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-[0.4rem]">
            <label className="text-[0.8rem] font-medium text-txt-muted">
              Folder name
            </label>
            <div className="flex items-center gap-2 border border-border rounded-[0.6rem] px-3 py-[0.6rem] bg-bg-muted focus-within:border-accent transition-colors">
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-txt-dim flex-shrink-0"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="e.g. Work projects"
                className="flex-1 bg-transparent border-none outline-none text-txt-primary text-[0.9rem] font-[inherit] placeholder:text-txt-dim"
              />
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 bg-bg-muted border border-border rounded-[0.6rem] px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-txt-dim flex-shrink-0 mt-[0.1rem]"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="text-[0.8rem] text-txt-dim leading-relaxed">
              Folders help you organise your chats. You can move any chat into a
              folder from the chat's context menu.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-4 border-t border-border">
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!name.trim() || loading}
            className="bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-[0.6rem] px-4 py-[0.5rem] text-[0.875rem] font-medium cursor-pointer transition-colors border-none"
          >
            {loading ? "Creating…" : "Create folder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderCard({
  folder,
  sessions,
  onClick,
  onRename,
  onDelete,
}: {
  folder: Folder;
  sessions: Session[];
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatCount = sessions.length;
  const lastUpdated =
    sessions
      .map((s) => s.updated_at)
      .sort()
      .slice(-1)[0] ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 148;
    let left = rect.right - menuWidth;
    if (left < 4) left = 4;
    setMenuPos({ left, top: rect.bottom + 4 });
    setMenuOpen(true);
  }

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    setRenameVal(folder.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function saveRename() {
    const name = renameVal.trim();
    if (name && name !== folder.name) {
      await renameFolder(folder.id, name);
      onRename(name);
    }
    setRenaming(false);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    if (
      !confirm(
        `Delete folder "${folder.name}"? Chats inside will be moved to ungrouped.`,
      )
    )
      return;
    await deleteFolder(folder.id);
    onDelete();
  }

  return (
    <div
      onClick={onClick}
      className="relative group bg-bg-surface dark:bg-[#13131a] border border-border rounded-[0.85rem] p-5 cursor-pointer hover:border-[#333] hover:bg-bg-hover transition-all flex flex-col gap-3 min-h-[120px]"
    >
      {/* Menu button */}
      <button
        onClick={openMenu}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-3 right-3 bg-transparent border-none text-txt-dim cursor-pointer px-[0.3rem] py-[0.15rem] opacity-0 group-hover:opacity-100 transition-opacity rounded-[0.3rem] hover:text-txt-primary hover:bg-bg-hover leading-none text-[1.1rem]"
      >
        ⋮
      </button>

      {/* Folder name */}
      {renaming ? (
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
              setRenaming(false);
            }
          }}
          onBlur={() => {
            void saveRename();
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-bg-muted border border-accent rounded-[0.3rem] text-txt-primary text-[0.95rem] font-semibold px-2 py-[0.2rem] outline-none font-[inherit] w-full"
        />
      ) : (
        <span className="text-[0.95rem] font-semibold text-txt-primary leading-tight pr-6">
          {folder.name}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[0.75rem] text-txt-dim">
          {chatCount === 0
            ? "No chats"
            : chatCount === 1
              ? "1 chat"
              : `${chatCount} chats`}
        </span>
        {lastUpdated && (
          <span className="text-[0.75rem] text-txt-dim">
            Updated {formatDate(lastUpdated)}
          </span>
        )}
      </div>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: menuPos.left,
            top: menuPos.top,
            zIndex: 200,
          }}
          className="bg-bg-surface border border-border rounded-[0.55rem] p-1 shadow-[0_6px_24px_rgba(0,0,0,0.25)] min-w-[148px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={startRename}
            className="flex items-center gap-[0.55rem] w-full bg-transparent border-none px-3 py-2 text-left text-[0.85rem] rounded-[0.35rem] cursor-pointer transition-all text-txt-muted dark:text-[#ccc] hover:bg-bg-hover hover:text-txt-heading"
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
            Rename
          </button>
          <button
            onClick={(e) => {
              void handleDelete(e);
            }}
            className="flex items-center gap-[0.55rem] w-full bg-transparent border-none px-3 py-2 text-left text-[0.85rem] rounded-[0.35rem] cursor-pointer transition-all text-[#e05252] hover:bg-[#2d1515]"
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ChatRow({
  session,
  onClick,
}: {
  session: Session;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between px-4 py-[0.7rem] rounded-[0.65rem] cursor-pointer hover:bg-bg-hover transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-txt-dim flex-shrink-0"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-[0.9rem] text-txt-primary whitespace-nowrap overflow-hidden text-ellipsis">
          {session.title || "New Chat"}
        </span>
      </div>
      <span className="text-[0.75rem] text-txt-dim flex-shrink-0 ml-3">
        {formatDate(session.updated_at)}
      </span>
    </div>
  );
}

export default function FoldersPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const { folders, setFolders, sessions, setSessions, sidebarOpen } = useApp();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("model");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderDocs, setFolderDocs] = useState<string[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFolderDocs = useCallback(async (id: string) => {
    try {
      const data = await getFolderDocs(id);
      setFolderDocs(data.files);
    } catch {
      // RAG might not be initialized (no Gemini key) - show empty list silently
      setFolderDocs([]);
    }
  }, []);

  useEffect(() => {
    if (folderId) {
      void loadFolderDocs(folderId);
    } else {
      setFolderDocs([]);
    }
  }, [folderId, loadFolderDocs]);

  function openSettings(tab = "model") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  function handleNewChat() {
    navigate("/");
  }

  function handleFolderCreated(folder: Folder) {
    setFolders((prev) => [...prev, folder]);
    setCreatingFolder(false);
  }

  function handleFolderRenamed(id: string, name: string) {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  function handleFolderDeleted(id: string) {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setSessions((prev) =>
      prev.map((s) => (s.folder_id === id ? { ...s, folder_id: null } : s)),
    );
    if (folderId === id) navigate("/folders");
  }

  const mainCls = `flex flex-col flex-1 overflow-hidden min-w-0 main-transition ${sidebarOpen ? "ml-[280px]" : "ml-0"}`;

  // ── Folder detail view ──────────────────────────────────────────────────────
  if (folderId) {
    const folder = folders.find((f) => f.id === folderId);
    const folderSessions = sessions.filter((s) => s.folder_id === folderId);

    return (
      <div className="flex h-full overflow-hidden">
        <Sidebar onOpenSettings={openSettings} onNewChat={handleNewChat} />
        <div className={mainCls}>
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <button
              onClick={() => navigate("/folders")}
              className="flex items-center gap-[0.4rem] bg-transparent border-none text-txt-dim hover:text-txt-primary cursor-pointer text-[0.85rem] transition-colors px-2 py-1 rounded-[0.4rem] hover:bg-bg-hover"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Folders
            </button>
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-txt-dim flex-shrink-0"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-[0.95rem] font-semibold text-txt-primary">
              {folder?.name ?? "Folder"}
            </span>
          </div>

          {/* Content: two columns */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[1100px] mx-auto flex flex-row gap-6 items-start">
              {/* Chats — left, grows to fill */}
              <div className="flex-1 min-w-0 border border-border rounded-[0.85rem] overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg-muted">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-txt-dim"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-[0.85rem] font-semibold text-txt-primary">
                    Chats
                  </span>
                </div>
                {folderSessions.length === 0 ? (
                  <div className="px-5 py-6 text-[0.85rem] text-txt-dim text-center">
                    No chats in this folder yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {folderSessions
                      .slice()
                      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                      .map((s) => (
                        <ChatRow
                          key={s.id}
                          session={s}
                          onClick={() => navigate(`/c/${s.id}`)}
                        />
                      ))}
                  </div>
                )}
              </div>

              {/* Knowledge base panel — right, fixed width */}
              <div className="w-[300px] flex-shrink-0 border border-border rounded-[0.85rem] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-muted">
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-txt-dim flex-shrink-0"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-[0.85rem] font-semibold text-txt-primary">
                      Knowledge base
                    </span>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={docsLoading}
                    className="flex items-center gap-[0.4rem] bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-[0.5rem] px-3 py-[0.35rem] text-[0.8rem] font-medium cursor-pointer transition-colors border-none"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f || !folderId) return;
                      e.target.value = "";
                      setDocsLoading(true);
                      setDocsError("");
                      try {
                        await uploadFolderDoc(folderId, f);
                        await loadFolderDocs(folderId);
                      } catch (err) {
                        setDocsError(
                          err instanceof Error ? err.message : "Upload failed",
                        );
                      } finally {
                        setDocsLoading(false);
                      }
                    }}
                  />
                </div>
                {docsError && (
                  <div className="px-5 py-2 text-[0.8rem] text-red-400 bg-red-900/10 border-b border-border">
                    {docsError}
                  </div>
                )}
                {folderDocs.length === 0 ? (
                  <div className="px-5 py-8 flex flex-col items-center gap-2 text-txt-dim">
                    <svg
                      viewBox="0 0 24 24"
                      width="28"
                      height="28"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-30"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-[0.8rem] text-center leading-relaxed">
                      No files yet.
                      <br />
                      .txt, .md or .pdf
                    </span>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {folderDocs.map((filename) => (
                      <div
                        key={filename}
                        className="flex items-center justify-between px-5 py-3 hover:bg-bg-hover transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <svg
                            viewBox="0 0 24 24"
                            width="13"
                            height="13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-txt-dim flex-shrink-0"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="text-[0.85rem] text-txt-primary truncate">
                            {filename}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            if (!folderId) return;
                            await deleteFolderDoc(folderId, filename);
                            setFolderDocs((prev) =>
                              prev.filter((f) => f !== filename),
                            );
                          }}
                          className="opacity-0 group-hover:opacity-100 bg-transparent border-none text-txt-dim hover:text-red-400 cursor-pointer p-1 rounded transition-all"
                          title="Remove"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="13"
                            height="13"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {settingsOpen && (
          <SettingsModal
            initialTab={settingsTab}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {creatingFolder && (
          <CreateFolderModal
            onClose={() => setCreatingFolder(false)}
            onCreated={handleFolderCreated}
          />
        )}
      </div>
    );
  }

  // ── Folder grid view ────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar onOpenSettings={openSettings} onNewChat={handleNewChat} />
      <div className={mainCls}>
        {/* Header */}
        <div className="flex items-center px-6 py-4 border-b border-border">
          <span className="text-[1rem] font-semibold text-txt-primary">
            Folders
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-txt-dim gap-3 pb-16">
              <svg
                viewBox="0 0 24 24"
                width="48"
                height="48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-25"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[0.9rem]">No folders yet</span>
              <button
                onClick={() => setCreatingFolder(true)}
                className="flex items-center gap-[0.5rem] bg-accent hover:bg-accent/90 text-white rounded-[0.55rem] px-4 py-[0.5rem] text-[0.85rem] font-medium cursor-pointer transition-colors border-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New folder
              </button>
            </div>
          ) : (
            <div className="max-w-[860px] mx-auto flex flex-col gap-6">
              {/* Centered create button above the grid */}
              <div className="flex justify-center">
                <button
                  onClick={() => setCreatingFolder(true)}
                  className="flex items-center gap-[0.5rem] bg-accent hover:bg-accent/90 text-white rounded-[0.55rem] px-4 py-[0.5rem] text-[0.85rem] font-medium cursor-pointer transition-colors border-none"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New folder
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {folders.map((f) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    sessions={sessions.filter((s) => s.folder_id === f.id)}
                    onClick={() => navigate(`/folders/${f.id}`)}
                    onRename={(name) => handleFolderRenamed(f.id, name)}
                    onDelete={() => handleFolderDeleted(f.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {settingsOpen && (
        <SettingsModal
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {creatingFolder && (
        <CreateFolderModal
          onClose={() => setCreatingFolder(false)}
          onCreated={handleFolderCreated}
        />
      )}
    </div>
  );
}
