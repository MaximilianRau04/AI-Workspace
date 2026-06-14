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
    ta.style.height = "44px";
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
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onAttachFile(file);
    e.target.value = "";
  }

  // Token ring (only rendered when tokenUsage !== null)
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
      {/* Attachment bar */}
      {pendingFile && (
        <div className="flex items-center gap-2 py-[0.4rem]">
          <div className="flex items-center gap-[0.55rem] bg-bg-muted border border-border rounded-[0.75rem] px-[0.7rem] py-[0.5rem] max-w-[280px] overflow-hidden">
            <div className="w-9 h-9 bg-accent rounded-[0.45rem] flex items-center justify-center flex-shrink-0 text-white">
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="currentColor"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0 gap-[0.1rem]">
              <span className="text-[0.82rem] text-[#e0e0e0] whitespace-nowrap overflow-hidden text-ellipsis font-medium leading-[1.2]">
                {pendingFile}
              </span>
              <span className="text-[0.7rem] text-[#888] uppercase">
                {pendingFile.includes(".")
                  ? pendingFile.split(".").pop()!.toUpperCase()
                  : "FILE"}
              </span>
            </div>
          </div>
          <button
            onClick={onRemoveFile}
            className="bg-transparent border-none text-[#555] cursor-pointer text-[0.85rem] leading-none p-[0.2rem] flex-shrink-0 hover:text-[#aaa]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-surface border border-border rounded-[1rem] focus-within:border-[#3d3d3d] transition-all">
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-transparent border-none text-[#999] text-[1.4rem] font-light cursor-pointer flex-shrink-0 px-[0.2rem] leading-none hover:text-txt-primary transition-colors"
          title="Attach document"
        >
          +
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 bg-transparent border-none text-txt-primary outline-none resize-none px-2 py-[0.6rem] text-[0.95rem] leading-[1.5] overflow-y-hidden"
          style={{ height: "44px", maxHeight: "160px" }}
        />

        {/* Web search toggle */}
        <button
          onClick={onToggleWebSearch}
          title={webSearch ? "Web search on" : "Web search off"}
          className={`bg-transparent border-none cursor-pointer flex-shrink-0 px-[0.2rem] flex items-center transition-colors ${webSearch ? "text-accent hover:text-accent-hover" : "text-[#999] hover:text-txt-primary"}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="18"
            height="18"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>

        {/* Mic button */}
        <button
          onClick={() => onToggleRecording((t) => setText((prev) => prev ? prev + " " + t : t))}
          title="Voice input"
          className={`bg-transparent border-none text-[#999] cursor-pointer flex-shrink-0 px-[0.2rem] flex items-center hover:text-txt-primary transition-colors ${isRecording ? "mic-recording text-[#e74c3c] hover:text-[#e74c3c]" : ""}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="18"
            height="18"
          >
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8" />
          </svg>
        </button>

        {/* Token display — only shown when the provider actually reports usage */}
        {tokenUsage !== null && (
          <div
            className="flex items-center gap-[0.4rem] cursor-default flex-shrink-0"
            title={tokenTitle}
          >
            <svg viewBox="0 0 36 36" width="26" height="26">
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke="#2a2a2a"
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
            <span className="text-[0.72rem] text-txt-dim whitespace-nowrap">
              {fmt(prompt)} / 1M
            </span>
          </div>
        )}

        {/* Send / Stop */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="bg-bg-muted dark:bg-[#3a3a3a] hover:bg-[#c0392b] hover:text-white border-none rounded-lg text-txt-primary px-[0.85rem] min-h-[34px] text-[0.95rem] cursor-pointer transition-colors flex-shrink-0"
          >
            &#9646;&#9646;
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="bg-accent hover:bg-accent-hover disabled:bg-accent-dim disabled:cursor-not-allowed border-none rounded-lg text-white px-[0.85rem] min-h-[34px] text-[0.95rem] cursor-pointer transition-colors flex-shrink-0"
          >
            &#9658;
          </button>
        )}
      </div>
    </div>
  );
}
