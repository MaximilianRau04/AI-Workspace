import { useEffect, useRef, useState } from "react";
import { renderMarkdown, decorateCodeBlocks } from "../../utils/markdown";

// ── Attachment chip inside user message ──────────────────────────────────────
interface AttachmentChipProps {
  filename: string;
}

function AttachmentChip({ filename }: AttachmentChipProps) {
  const ext = filename?.includes(".")
    ? filename.split(".").pop()!.toUpperCase()
    : "FILE";
  return (
    <div className="self-end flex items-center gap-[0.55rem] bg-[#1e2023] border border-[#2e3035] rounded-[0.75rem] px-[0.7rem] py-[0.5rem] max-w-[280px] overflow-hidden">
      <div className="w-9 h-9 bg-accent rounded-[0.45rem] flex items-center justify-center flex-shrink-0 text-white">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
        </svg>
      </div>
      <div className="flex flex-col min-w-0 gap-[0.1rem]">
        <span className="text-[0.82rem] text-[#e0e0e0] whitespace-nowrap overflow-hidden text-ellipsis font-medium leading-[1.2]">
          {filename}
        </span>
        <span className="text-[0.7rem] text-[#888] uppercase">{ext}</span>
      </div>
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────
interface ActionBtnProps {
  icon: string;
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function ActionBtn({ icon, title, onClick }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="bg-transparent border-none text-[#555] cursor-pointer text-[1.5rem] px-[0.55rem] py-[0.45rem] rounded-[0.4rem] leading-none transition-all hover:text-[#ccc] hover:bg-[#2a2a2a]"
    >
      {icon}
    </button>
  );
}

async function copyToClipboard(
  getText: () => string,
  btn: HTMLButtonElement,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(getText());
    const orig = btn.textContent;
    btn.textContent = "✓";
    setTimeout(() => {
      btn.textContent = orig;
    }, 1500);
  } catch {
    /* silent */
  }
}

// ── Thinking block ────────────────────────────────────────────────────────────
interface ThinkingBlockProps {
  text: string;
  streaming: boolean;
  elapsed: number;
}

function ThinkingBlock({ text, streaming, elapsed }: ThinkingBlockProps) {
  const [open, setOpen] = useState(true);
  const label = streaming
    ? "Thinking…"
    : elapsed > 0
      ? `Thought for ${elapsed}s`
      : "Thought";

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className={`thinking-block mb-[0.6rem] ${streaming ? "thinking-streaming" : ""}`}
    >
      <summary className="thinking-summary">
        <span className="thinking-dot" />
        <span className="italic">{label}</span>
      </summary>
      <div className="thinking-body">{text}</div>
    </details>
  );
}

// ── Inline edit ───────────────────────────────────────────────────────────────
interface InlineEditProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

function InlineEdit({ initialText, onSave, onCancel }: InlineEditProps) {
  const [value, setValue] = useState(initialText);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = taRef.current.scrollHeight + "px";
      taRef.current.focus();
      taRef.current.setSelectionRange(value.length, value.length);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInput() {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = taRef.current.scrollHeight + "px";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSave(value.trim());
    }
  }

  return (
    <div className="w-full">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="w-full bg-[#1e1e1e] border border-[#3a3a3a] focus:border-accent rounded-[0.75rem] text-txt-primary font-[inherit] text-[0.95rem] leading-[1.55] min-h-[44px] outline-none px-[0.85rem] py-[0.6rem] resize-none word-break-break-word"
      />
      <div className="flex gap-[0.4rem] justify-end mt-[0.3rem]">
        <button
          onClick={onCancel}
          className="bg-[#2a2a2a] border-none rounded-lg text-[#aaa] cursor-pointer text-[0.8rem] px-3 py-[0.3rem] transition-all hover:bg-[#3a3a3a] hover:text-txt-primary"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(value.trim())}
          className="bg-accent hover:bg-accent-hover border-none rounded-lg text-white cursor-pointer text-[0.8rem] px-3 py-[0.3rem] transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Bot bubble with markdown ──────────────────────────────────────────────────
interface BotBubbleProps {
  text: string;
  isStreaming: boolean;
  thinkingText: string;
  thinkingStreaming: boolean;
  thinkingElapsed: number;
}

function BotBubble({
  text,
  isStreaming,
  thinkingText,
  thinkingStreaming,
  thinkingElapsed,
}: BotBubbleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTextRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current || !text) return;
    if (text === prevTextRef.current) return;
    prevTextRef.current = text;

    if (isStreaming) {
      containerRef.current.textContent = text;
    } else {
      const html = renderMarkdown(text);
      containerRef.current.innerHTML = html;
      decorateCodeBlocks(containerRef.current);
    }
  }, [text, isStreaming]);

  return (
    <div>
      {thinkingText && (
        <ThinkingBlock
          text={thinkingText}
          streaming={thinkingStreaming}
          elapsed={thinkingElapsed}
        />
      )}
      <div
        ref={containerRef}
        className="bot-bubble text-[0.95rem] leading-[1.55] word-break-break-word text-txt-primary dark:text-txt-primary"
      />
    </div>
  );
}

// ── MessagePair ───────────────────────────────────────────────────────────────
interface MessagePairProps {
  pairIndex: number;
  userText: string;
  attachedFile: string | null;
  botText: string;
  isStreaming: boolean;
  thinkingText: string;
  thinkingStreaming: boolean;
  thinkingElapsed: number;
  onRetry: (pairIndex: number, text: string) => void;
  onEdit: (pairIndex: number, newText: string) => void;
}

export default function MessagePair({
  pairIndex,
  userText,
  attachedFile,
  botText,
  isStreaming,
  thinkingText,
  thinkingStreaming,
  thinkingElapsed,
  onRetry,
  onEdit,
}: MessagePairProps) {
  const [editing, setEditing] = useState(false);

  function handleRetry() {
    onRetry(pairIndex, userText);
  }
  function handleEdit() {
    setEditing(true);
  }
  function handleEditSave(newText: string) {
    setEditing(false);
    if (newText) onEdit(pairIndex, newText);
  }

  return (
    <div className="w-full max-w-[760px]">
      {/* User message */}
      <div className="flex flex-col items-end gap-[0.25rem] group mb-4">
        {attachedFile && <AttachmentChip filename={attachedFile} />}

        {editing ? (
          <div className="w-full">
            <InlineEdit
              initialText={userText}
              onSave={handleEditSave}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <div className="bg-accent text-white px-4 py-[0.65rem] rounded-[1.2rem] rounded-br-[0.3rem] text-[0.95rem] leading-[1.55] break-words whitespace-pre-wrap">
              {userText}
            </div>
            <div className="flex flex-row gap-[0.15rem] opacity-0 group-hover:opacity-100 transition-opacity">
              <ActionBtn icon="↻" title="Try again" onClick={handleRetry} />
              <ActionBtn
                icon="⧉"
                title="Copy"
                onClick={(e) => {
                  void copyToClipboard(() => userText, e.currentTarget);
                }}
              />
              <ActionBtn icon="✏" title="Edit" onClick={handleEdit} />
            </div>
          </>
        )}
      </div>

      {/* Bot message */}
      {(botText !== undefined || isStreaming) && (
        <div className="group w-full max-w-[760px]">
          {isStreaming && !botText ? (
            <span className="thinking-dots">
              Thinking<span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          ) : (
            <BotBubble
              text={botText || ""}
              isStreaming={isStreaming}
              thinkingText={thinkingText}
              thinkingStreaming={thinkingStreaming}
              thinkingElapsed={thinkingElapsed}
            />
          )}
          {!isStreaming && botText && (
            <div className="flex flex-row gap-[0.15rem] opacity-0 group-hover:opacity-100 transition-opacity mt-[0.25rem]">
              <ActionBtn
                icon="⧉"
                title="Copy"
                onClick={(e) => {
                  void copyToClipboard(() => botText, e.currentTarget);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
