import { useState, useRef } from "react";
import type { Folder, Session } from "../../types";
import SessionContextMenu from "./SessionContextMenu";
import { formatDate } from "./sidebarUtils";

interface SessionItemProps {
  session: Session;
  folders: Folder[];
  isActive: boolean;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, newTitle: string) => void;
  onPinToggled: (id: string, pinned: boolean) => void;
  onMoved: (id: string, folderId: string | null) => void;
}

export default function SessionItem({
  session,
  folders,
  isActive,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onSelect,
  onDeleted,
  onRenamed,
  onPinToggled,
  onMoved,
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
            <svg
              viewBox="0 0 24 24"
              width="10"
              height="10"
              fill="currentColor"
              className="text-accent flex-shrink-0 opacity-70"
            >
              <path d="M12 2l2.4 6.4L21 9.3l-5 4.7 1.5 6.6L12 17l-5.5 3.6L8 14 3 9.3l6.6-.9z" />
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
          folderId={session.folder_id}
          folders={folders}
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
          onPinToggled={handlePinToggled}
          onMoved={(folderId) => {
            onMoved(session.id, folderId);
          }}
        />
      )}
    </>
  );
}
