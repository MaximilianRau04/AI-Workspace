import { useEffect, useRef, useState } from "react";
import { buildArtifactHtml } from "../../utils/artifact";

interface ArtifactPanelProps {
  code: string;
  language: string;
  onClose: () => void;
}

const LANG_LABELS: Record<string, string> = {
  html: "HTML",
  svg: "SVG",
  jsx: "React (JSX)",
  tsx: "React (TSX)",
  react: "React",
};

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export default function ArtifactPanel({
  code,
  language,
  onClose,
}: ArtifactPanelProps) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const html = buildArtifactHtml(code, language);

  useEffect(() => {
    setReloadKey(0);
    setView("preview");
  }, [code, language]);

  useEffect(() => {
    if (view === "code" && codeRef.current && typeof hljs !== "undefined") {
      codeRef.current.removeAttribute("data-highlighted");
      hljs.highlightElement(codeRef.current);
    }
  }, [view, code]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* silent */
    }
  }

  return (
    <div className="w-[46%] max-w-[720px] min-w-[360px] h-full flex-shrink-0 border-l border-border bg-bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-[0.85rem] font-medium text-txt-primary min-w-0 truncate">
          {LANG_LABELS[language.toLowerCase()] || language}
        </span>
        <div className="flex items-center gap-1 bg-bg-base border border-border rounded-lg p-[0.15rem] ml-2 flex-shrink-0">
          {(["preview", "code"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-[0.3rem] rounded-[0.35rem] text-[0.78rem] cursor-pointer border-none transition-colors capitalize flex-shrink-0 ${
                view === v
                  ? "bg-accent text-white"
                  : "bg-transparent text-txt-dim hover:text-txt-primary"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[0.5rem]" />
        {view === "preview" && (
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload"
            className="w-[28px] h-[28px] rounded-[0.4rem] flex items-center justify-center border-none cursor-pointer bg-transparent text-txt-dim hover:text-txt-primary hover:bg-bg-muted transition-colors flex-shrink-0"
          >
            <RefreshIcon />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void handleCopy();
          }}
          title="Copy code"
          className="w-[28px] h-[28px] rounded-[0.4rem] flex items-center justify-center border-none cursor-pointer bg-transparent text-txt-dim hover:text-txt-primary hover:bg-bg-muted transition-colors flex-shrink-0"
        >
          {copied ? "✓" : <CopyIcon />}
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="w-[28px] h-[28px] rounded-[0.4rem] flex items-center justify-center border-none cursor-pointer bg-transparent text-txt-dim hover:text-txt-primary hover:bg-bg-muted transition-colors flex-shrink-0"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden relative">
        {view === "preview" ? (
          <iframe
            key={reloadKey}
            title="Artifact preview"
            srcDoc={html}
            sandbox="allow-scripts"
            className="w-full h-full border-none bg-white"
          />
        ) : (
          <pre className="w-full h-full m-0 overflow-auto p-4 text-[0.82rem] leading-[1.5]">
            <code ref={codeRef} className={`language-${language}`}>
              {code}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
