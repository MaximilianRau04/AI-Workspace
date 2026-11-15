import { useState, useRef, useEffect } from "react";
import {
  deleteChat,
  moveChatToFolder,
  pinChat,
  renameChat,
} from "../../api/chats";
import type { Folder, Session } from "../../types";

export interface SessionContextMenuProps {
  sessionId: string;
  pinned: boolean;
  folderId: string | null;
  folders: Folder[];
  titleRef: React.MutableRefObject<string>;
  onClose: () => void;
  onDeleted: () => void;
  onRenamed: (newTitle: string) => void;
  onPinToggled: (pinned: boolean) => void;
  onMoved: (folderId: string | null) => void;
  anchorEl: HTMLElement | null;
}

export default function SessionContextMenu({
  sessionId,
  pinned,
  folderId,
  folders,
  titleRef,
  onClose,
  onDeleted,
  onRenamed,
  onPinToggled,
  onMoved,
  anchorEl,
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [renaming, setRenaming] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
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

  const menuWrapCls =
    "bg-bg-surface border border-border rounded-[0.55rem] p-1 shadow-[0_6px_24px_rgba(0,0,0,0.25)] min-w-[160px]";

  if (pickingFolder) {
    return (
      <div
        ref={menuRef}
        style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 200 }}
        className={menuWrapCls}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setPickingFolder(false)}
          className="flex items-center gap-2 w-full bg-transparent border-none px-3 py-[0.4rem] text-left text-[0.8rem] text-txt-dim hover:text-txt-primary rounded-[0.35rem] cursor-pointer hover:bg-bg-hover transition-all mb-[0.15rem]"
        >
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Move to folder
        </button>
        <div className="border-t border-border my-[0.2rem]" />
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              void moveChatToFolder(sessionId, f.id).then(() => {
                onMoved(f.id);
                onClose();
              });
            }}
            className={`flex items-center gap-[0.5rem] w-full bg-transparent border-none px-3 py-[0.45rem] text-left text-[0.85rem] rounded-[0.35rem] cursor-pointer transition-all text-txt-muted hover:bg-bg-hover hover:text-txt-heading ${folderId === f.id ? "font-medium text-txt-primary" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            {f.name}
          </button>
        ))}
        {folders.length === 0 && (
          <div className="px-3 py-2 text-[0.8rem] text-txt-dim">
            No folders yet
          </div>
        )}
        {folderId && (
          <>
            <div className="border-t border-border my-[0.2rem]" />
            <button
              onClick={() => {
                void moveChatToFolder(sessionId, null).then(() => {
                  onMoved(null);
                  onClose();
                });
              }}
              className="flex items-center gap-[0.5rem] w-full bg-transparent border-none px-3 py-[0.45rem] text-left text-[0.85rem] rounded-[0.35rem] cursor-pointer transition-all text-txt-dim hover:bg-bg-hover hover:text-txt-heading"
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Remove from folder
            </button>
          </>
        )}
      </div>
    );
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
          <line x1="2" y1="2" x2="22" y2="22" />
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14" />
          <path d="M15 9.34V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0-.56.08" />
        </svg>
      ) : (
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
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      label: "Move to folder",
      action: () => setPickingFolder(true),
    },
    {
      icon: (
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
      ),
      label: "Rename",
      action: startRename,
    },
    {
      icon: (
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
      ),
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
      className={menuWrapCls}
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
