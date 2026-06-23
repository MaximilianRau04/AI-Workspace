import { useRef, useState, useEffect } from "react";
import type { TokenUsage } from "../../types";

interface InputAreaProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  pendingFile: string | null;
  onRemoveFile: () => void;
  onAttachFile: (file: File) => void;
  isRecording: boolean;
  onToggleRecording: (fill?: (text: string) => void) => void;
  tokenUsage: TokenUsage | null;
  webSearch: boolean;
  onToggleWebSearch: () => void;
}

/* ── Icon components ── */

function PaperclipIcon() {
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
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
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

function MicIcon() {
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
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8" />
    </svg>
  );
}

function ArrowUpIcon() {
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
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function StopSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
    </svg>
  );
}

/* ── ToolBtn ── */
interface ToolBtnProps {
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

function ToolBtn({ onClick, title, active, danger, children }: ToolBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-[30px] h-[30px] rounded-[0.45rem] flex items-center justify-center border-none cursor-pointer transition-all flex-shrink-0 ${
        danger
          ? "text-txt-dim hover:text-[#e74c3c] hover:bg-[#e74c3c]/10"
          : active
            ? "bg-accent/10 text-accent hover:bg-accent/15"
            : "bg-transparent text-txt-dim hover:text-txt-muted hover:bg-bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function InputArea({
  onSend,
  onStop,
  isStreaming,
  pendingFile,
  onRemoveFile,
  onAttachFile,
  isRecording,
  onToggleRecording,
  tokenUsage,
  webSearch,
  onToggleWebSearch,
}: InputAreaProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const newH = Math.min(ta.scrollHeight, 160);
    ta.style.height = newH + "px";
    ta.style.overflowY = newH >= 160 ? "auto" : "hidden";
  }

  useEffect(() => {
    autoResize();
  }, [text]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "40px";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onAttachFile(file);
    e.target.value = "";
  }

  // Token ring
  const TOKEN_LIMIT = 1_000_000;
  const prompt = tokenUsage?.prompt ?? 0;
  const reply = tokenUsage?.reply ?? 0;
  const pct = Math.min(prompt / TOKEN_LIMIT, 1);
  const arc = (pct * 100).toFixed(1);
  const arcColor = pct > 0.85 ? "#e74c3c" : pct > 0.6 ? "#e67e22" : "#2f6df5";
  const fmt = (n: number) =>
    n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  const tokenTitle = `Context: ${prompt.toLocaleString("en")} tokens\nReply: ${reply.toLocaleString("en")} tokens\nLimit: 1,000,000 tokens`;

  return (
    <div className="w-[calc(100%-3rem)] max-w-[760px] mx-auto mb-5 flex-shrink-0">
      {/* Attachment chip */}
      {pendingFile && (
        <div className="flex items-center gap-2 pb-[0.4rem]">
          <div className="flex items-center gap-[0.55rem] bg-bg-muted border border-border rounded-[0.75rem] px-[0.7rem] py-[0.45rem] max-w-[280px] overflow-hidden">
            <div className="w-8 h-8 bg-gradient-to-br from-accent to-[#5b4af8] rounded-[0.4rem] flex items-center justify-center flex-shrink-0 text-white">
              <FileIcon />
            </div>
            <div className="flex flex-col min-w-0 gap-[0.05rem]">
              <span className="text-[0.82rem] text-txt-primary whitespace-nowrap overflow-hidden text-ellipsis font-medium leading-[1.2]">
                {pendingFile}
              </span>
              <span className="text-[0.7rem] text-txt-dim uppercase">
                {pendingFile.includes(".")
                  ? pendingFile.split(".").pop()!.toUpperCase()
                  : "FILE"}
              </span>
            </div>
          </div>
          <ToolBtn onClick={onRemoveFile} title="Remove">
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
          </ToolBtn>
        </div>
      )}

      {/* Input pill */}
      <div className="flex flex-col bg-bg-surface border border-border rounded-[1.1rem] transition-all input-glow shadow-sm overflow-hidden">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything…"
          rows={1}
          className="w-full bg-transparent border-none text-txt-primary outline-none resize-none px-4 pt-[0.8rem] pb-[0.4rem] text-[0.95rem] leading-[1.55] overflow-y-hidden placeholder:text-txt-dim font-[inherit]"
          style={{ height: "40px", maxHeight: "160px", minHeight: "40px" }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center gap-[0.15rem] px-[0.55rem] pb-[0.55rem] pt-[0.1rem]">
          {/* Attach */}
          <ToolBtn
            onClick={() => fileInputRef.current?.click()}
            title="Attach document"
          >
            <PaperclipIcon />
          </ToolBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Web search */}
          <ToolBtn
            onClick={onToggleWebSearch}
            title={webSearch ? "Web search on" : "Web search off"}
            active={webSearch}
          >
            <GlobeIcon />
          </ToolBtn>

          {/* Mic */}
          <ToolBtn
            onClick={() =>
              onToggleRecording((t) =>
                setText((prev) => (prev ? prev + " " + t : t)),
              )
            }
            title="Voice input"
            danger={isRecording}
            active={isRecording}
          >
            <span className={isRecording ? "mic-recording" : ""}>
              <MicIcon />
            </span>
          </ToolBtn>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Token ring */}
          {tokenUsage !== null && (
            <div
              className="flex items-center gap-[0.35rem] cursor-default flex-shrink-0 mr-1"
              title={tokenTitle}
            >
              <svg viewBox="0 0 36 36" width="22" height="22">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke={arcColor}
                  strokeWidth="3.5"
                  strokeDasharray={`${arc} ${100 - parseFloat(arc)}`}
                  strokeDashoffset="25"
                  strokeLinecap="round"
                  className="token-arc"
                />
              </svg>
              <span className="text-[0.7rem] text-txt-dim whitespace-nowrap tabular-nums">
                {fmt(prompt)} / 1M
              </span>
            </div>
          )}

          {/* Send / Stop */}
          {isStreaming ? (
            <button
              onClick={onStop}
              title="Stop generating"
              className="w-[32px] h-[32px] rounded-full bg-bg-muted hover:bg-bg-hover border-none text-txt-muted hover:text-txt-primary flex items-center justify-center cursor-pointer transition-all flex-shrink-0"
            >
              <StopSquareIcon />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              title="Send"
              className="w-[32px] h-[32px] rounded-full bg-gradient-to-br from-accent to-[#5b4af8] hover:from-[#1a5de0] hover:to-[#4a3ae0] disabled:opacity-30 disabled:cursor-not-allowed border-none text-white flex items-center justify-center cursor-pointer transition-all flex-shrink-0 hover:shadow-[0_2px_12px_rgba(47,109,245,0.4)]"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
