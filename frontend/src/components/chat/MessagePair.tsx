import { useEffect, useRef, useState } from "react";
import { renderMarkdown, decorateCodeBlocks } from "../../utils/markdown";
import type { CodeResult } from "../../types";

// ── Attachment chip inside user message ──────────────────────────────────────
interface AttachmentChipProps {
  filename: string;
}

function AttachmentChip({ filename }: AttachmentChipProps) {
  const ext = filename?.includes(".")
    ? filename.split(".").pop()!.toUpperCase()
    : "FILE";
  return (
    <div className="self-end flex items-center gap-[0.55rem] bg-bg-muted border border-border rounded-[0.75rem] px-[0.7rem] py-[0.5rem] max-w-[280px] overflow-hidden">
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
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function ActionBtn({ icon, title, active, onClick }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`bg-transparent border-none cursor-pointer text-[1.5rem] px-[0.55rem] py-[0.45rem] rounded-[0.4rem] leading-none transition-all flex items-center hover:bg-bg-hover ${
        active
          ? "text-accent hover:text-accent"
          : "text-txt-dim hover:text-txt-muted"
      }`}
    >
      {icon}
    </button>
  );
}

// ── Speaker icon (matches the icon previously used for the global TTS toggle) ─
function SpeakerIcon() {
  return (
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
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
        className="w-full bg-bg-muted border border-border focus:border-accent rounded-[0.75rem] text-txt-primary font-[inherit] text-[0.95rem] leading-[1.55] min-h-[44px] outline-none px-[0.85rem] py-[0.6rem] resize-none word-break-break-word"
      />
      <div className="flex gap-[0.4rem] justify-end mt-[0.3rem]">
        <button
          onClick={onCancel}
          className="bg-bg-muted border-none rounded-lg text-txt-muted cursor-pointer text-[0.8rem] px-3 py-[0.3rem] transition-all hover:bg-bg-hover hover:text-txt-primary"
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

// ── Code execution result block ───────────────────────────────────────────────
interface CodeResultBlockProps {
  result: CodeResult;
}

const LANG_LABELS: Record<string, string> = {
  python: "Python",
  python3: "Python",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  bash: "Bash",
  sh: "Bash",
  ruby: "Ruby",
  rb: "Ruby",
  php: "PHP",
  perl: "Perl",
  pl: "Perl",
  elixir: "Elixir",
  ex: "Elixir",
  lua: "Lua",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  java: "Java",
  go: "Go",
};

function CodeResultBlock({ result }: CodeResultBlockProps) {
  const [open, setOpen] = useState(true);
  const label = LANG_LABELS[result.language.toLowerCase()] ?? result.language;
  const success = result.exit_code === 0;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="mb-[0.6rem] rounded-[0.6rem] border border-border overflow-hidden"
    >
      <summary className="flex items-center gap-2 px-3 py-[0.4rem] bg-bg-muted cursor-pointer select-none text-[0.8rem] text-txt-muted list-none">
        <span
          className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${success ? "bg-[#2ecc71]" : "bg-[#e74c3c]"}`}
        />
        <span className="font-mono">{label}</span>
        <span className="text-txt-dim">·</span>
        <span className="text-txt-dim">exit {result.exit_code}</span>
        <span className="ml-auto text-[0.72rem]">{open ? "▲" : "▼"}</span>
      </summary>
      <div className="px-3 py-2 bg-bg-base text-[0.82rem] font-mono leading-[1.5] overflow-x-auto">
        {result.stdout && (
          <pre className="whitespace-pre-wrap break-words text-txt-primary m-0">
            {result.stdout}
          </pre>
        )}
        {result.stderr && (
          <pre className="whitespace-pre-wrap break-words text-[#e74c3c] m-0 mt-1">
            {result.stderr}
          </pre>
        )}
        {!result.stdout && !result.stderr && (
          <span className="text-txt-dim italic">(no output)</span>
        )}
      </div>
    </details>
  );
}

// ── Bot bubble with markdown ──────────────────────────────────────────────────
interface BotBubbleProps {
  text: string;
  isStreaming: boolean;
  thinkingText: string;
  thinkingStreaming: boolean;
  thinkingElapsed: number;
  codeResults: CodeResult[];
}

function BotBubble({
  text,
  isStreaming,
  thinkingText,
  thinkingStreaming,
  thinkingElapsed,
  codeResults,
}: BotBubbleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTextRef = useRef<string>("");

  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!containerRef.current || !text) return;
    if (text === prevTextRef.current) return;
    prevTextRef.current = text;

    if (!isStreaming) {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      containerRef.current.innerHTML = renderMarkdown(text);
      decorateCodeBlocks(containerRef.current);
      return;
    }

    // During streaming: render immediately on block boundaries, debounce otherwise
    const endsBlock = text.endsWith("\n\n") || /```\s*$/.test(text);
    if (endsBlock) {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      containerRef.current.innerHTML = renderMarkdown(text);
    } else {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      renderTimerRef.current = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.innerHTML = renderMarkdown(prevTextRef.current);
        }
      }, 80);
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
      {codeResults.map((r, i) => (
        <CodeResultBlock key={i} result={r} />
      ))}
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
  interrupted: boolean;
  thinkingText: string;
  thinkingStreaming: boolean;
  thinkingElapsed: number;
  searchQuery: string | null;
  codeResults: CodeResult[];
  onRetry: (pairIndex: number, text: string) => void;
  onEdit: (pairIndex: number, newText: string) => void;
  onSpeak: (id: number, text: string) => void;
  speaking: boolean;
}

export default function MessagePair({
  pairIndex,
  userText,
  attachedFile,
  botText,
  isStreaming,
  interrupted,
  thinkingText,
  thinkingStreaming,
  thinkingElapsed,
  searchQuery,
  codeResults,
  onRetry,
  onEdit,
  onSpeak,
  speaking,
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
            <div className="bg-gradient-to-br from-accent to-[#5b4af8] text-white px-4 py-[0.65rem] rounded-[1.2rem] rounded-br-[0.3rem] text-[0.95rem] leading-[1.55] break-words whitespace-pre-wrap shadow-[0_4px_16px_rgba(47,109,245,0.2)]">
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
          {isStreaming && searchQuery && !botText ? (
            <span className="thinking-dots text-[#888] text-[0.88rem]">
              Searching for &ldquo;{searchQuery}&rdquo;<span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          ) : isStreaming && !botText ? (
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
              codeResults={codeResults}
            />
          )}
          {!isStreaming && interrupted && (
            <div className="mt-2 mb-1">
              <span className="inline-flex items-center gap-1 text-[0.72rem] text-[#888] bg-[#1e1e1e] border border-[#2e2e2e] rounded-full px-[0.55rem] py-[0.2rem]">
                <span>⏸</span> Interrupted
              </span>
            </div>
          )}
          {!isStreaming && botText && (
            <div
              className={`flex flex-row gap-[0.15rem] transition-opacity mt-[0.25rem] ${speaking ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <ActionBtn
                icon="⧉"
                title="Copy"
                onClick={(e) => {
                  void copyToClipboard(() => botText, e.currentTarget);
                }}
              />
              <ActionBtn
                icon={<SpeakerIcon />}
                title={speaking ? "Stop" : "Play"}
                active={speaking}
                onClick={() => onSpeak(pairIndex, botText)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
