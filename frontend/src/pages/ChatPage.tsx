import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useStream } from "../hooks/useStream";
import { useVoice } from "../hooks/useVoice";
import { getChat, createChat } from "../api/chats";
import { uploadDoc, deleteDoc } from "../api/docs";
import { logout } from "../api/auth";
import Sidebar from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import ChatArea from "../components/chat/ChatArea";
import InputArea from "../components/chat/InputArea";
import HomeHero from "../components/chat/HomeHero";
import SettingsModal from "../components/settings/SettingsModal";
import DocsModal from "../components/documents/DocsModal";
import type { ChatPair, TokenUsage, StreamError } from "../types";

const ALLOWED_EXTS = [".txt", ".md", ".pdf"];

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    user,
    currentSessionId,
    setCurrentSessionId,
    refreshSessions,
    sidebarOpen,
    theme,
    toggleTheme,
  } = useApp();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [pairs, setPairs] = useState<ChatPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [errorMessages, setErrorMessages] = useState<StreamError[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("model");
  const [docsOpen, setDocsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [themeSpinning, setThemeSpinning] = useState(false);
  const [webSearch, setWebSearch] = useState<boolean>(
    () => localStorage.getItem("webSearch") === "true",
  );

  const pairCounterRef = useRef<number>(0);
  const streamingPairRef = useRef<number | null>(null);
  const dragCounterRef = useRef<number>(0);
  const loadedSessionRef = useRef<string | null>(null);

  const { stream, abort } = useStream();
  const { speakingId, speak, isRecording, toggleRecording } = useVoice();

  const homeMode = !sessionId; // URL param is immediately available, avoids race with context state

  // ── Load session from URL ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (sessionId) {
      setCurrentSessionId(sessionId);
      if (sessionId !== loadedSessionRef.current) {
        loadedSessionRef.current = sessionId;
        void loadSession(sessionId);
      }
    } else {
      loadedSessionRef.current = null;
      setCurrentSessionId(null);
      setPairs([]);
      pairCounterRef.current = 0;
    }
  }, [sessionId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSession(id: string): Promise<void> {
    setLoading(true);
    setPairs([]);
    pairCounterRef.current = 0;
    try {
      const data = await getChat(id);
      const messages = data.messages || [];
      const newPairs: ChatPair[] = [];
      for (let i = 0; i < messages.length; i += 2) {
        const userMsg = messages[i];
        const botMsg = messages[i + 1];
        newPairs.push({
          pairIndex: pairCounterRef.current++,
          userText: userMsg?.parts?.[0] || "",
          attachedFile: null,
          botText: botMsg?.parts?.[0] || "",
          isStreaming: false,
          interrupted: false,
          thinkingText: "",
          thinkingStreaming: false,
          thinkingElapsed: 0,
          searchQuery: null,
        });
      }
      setPairs(newPairs);
    } catch (e) {
      console.error("Load session failed:", e);
    } finally {
      setLoading(false);
    }
  }

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string, editingIndex: number | null = null): Promise<void> => {
      if (!text.trim()) return;

      let chatId = currentSessionId;
      if (!chatId) {
        const data = await createChat();
        chatId = data.id;
        loadedSessionRef.current = chatId; // prevent useEffect from calling loadSession on the empty new chat
        setCurrentSessionId(chatId);
        navigate(`/c/${chatId}`, { replace: true });
      }

      const isEdit = editingIndex !== null;
      if (isEdit) {
        setPairs((prev) =>
          prev.filter((p) => p.pairIndex < (editingIndex as number)),
        );
        pairCounterRef.current = editingIndex as number;
      }

      const fileForSend = pendingFile;
      if (fileForSend) setPendingFile(null);

      const newPairIdx = pairCounterRef.current;
      pairCounterRef.current = newPairIdx + 1;

      const newPair: ChatPair = {
        pairIndex: newPairIdx,
        userText: text,
        attachedFile: fileForSend,
        botText: "",
        isStreaming: true,
        interrupted: false,
        thinkingText: "",
        thinkingStreaming: false,
        thinkingElapsed: 0,
        searchQuery: null,
      };
      setPairs((prev) => [
        ...prev.filter((p) => p.pairIndex < newPairIdx),
        newPair,
      ]);
      streamingPairRef.current = newPairIdx;

      setIsStreaming(true);
      setErrorMessages([]);

      const thinkingStartRef = { current: 0 };

      await stream(
        chatId,
        text,
        fileForSend,
        isEdit ? editingIndex : null,
        {
          onChunk: (_char, fullText) => {
            setPairs((prev) =>
              prev.map((p) =>
                p.pairIndex === newPairIdx ? { ...p, botText: fullText } : p,
              ),
            );
          },
          onThinking: (_chunk) => {
            setPairs((prev) =>
              prev.map((p) => {
                if (p.pairIndex !== newPairIdx) return p;
                if (!p.thinkingText) thinkingStartRef.current = Date.now();
                return {
                  ...p,
                  thinkingText: p.thinkingText + _chunk,
                  thinkingStreaming: true,
                };
              }),
            );
          },
          onSearching: (query) => {
            setPairs((prev) =>
              prev.map((p) =>
                p.pairIndex === newPairIdx ? { ...p, searchQuery: query } : p,
              ),
            );
          },
          onDone: (fullText) => {
            const elapsed = Math.round(
              (Date.now() - (thinkingStartRef.current || Date.now())) / 1000,
            );
            setPairs((prev) =>
              prev.map((p) =>
                p.pairIndex === newPairIdx
                  ? {
                      ...p,
                      botText: fullText,
                      isStreaming: false,
                      thinkingStreaming: false,
                      thinkingElapsed: elapsed,
                    }
                  : p,
              ),
            );
            void refreshSessions();
          },
          onTitle: () => {
            void refreshSessions();
          },
          onUsage: (payload) => {
            setTokenUsage({ prompt: payload.prompt, reply: payload.reply });
          },
          onError: (payload) => {
            setPairs((prev) => prev.filter((p) => p.pairIndex !== newPairIdx));
            setErrorMessages((prev) => [...prev, payload]);
          },
        },
        webSearch,
      );

      setIsStreaming(false);
      streamingPairRef.current = null;
    },
    [
      currentSessionId,
      pendingFile,
      stream,
      navigate,
      refreshSessions,
      setCurrentSessionId,
    ],
  );

  // ── Retry / Edit ─────────────────────────────────────────────────────────────
  const handleRetry = useCallback(
    (pairIndex: number, text: string) => {
      void handleSend(text, pairIndex);
    },
    [handleSend],
  );

  const handleEdit = useCallback(
    (pairIndex: number, newText: string) => {
      void handleSend(newText, pairIndex);
    },
    [handleSend],
  );

  // ── Stop streaming ────────────────────────────────────────────────────────────
  function handleStop(): void {
    abort();
    setIsStreaming(false);
    if (streamingPairRef.current !== null) {
      const idx = streamingPairRef.current;
      setPairs((prev) =>
        prev.map((p) =>
          p.pairIndex === idx
            ? {
                ...p,
                isStreaming: false,
                thinkingStreaming: false,
                interrupted: true,
              }
            : p,
        ),
      );
    }
  }

  // ── New chat ──────────────────────────────────────────────────────────────────
  function handleNewChat(): void {
    if (isStreaming) abort();
    setCurrentSessionId(null);
    setPairs([]);
    setErrorMessages([]);
    pairCounterRef.current = 0;
    navigate("/");
  }

  // ── File attach ───────────────────────────────────────────────────────────────
  async function handleAttachFile(file: File): Promise<void> {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) return;
    await uploadDoc(file);
    setPendingFile(file.name);
  }

  async function handleRemoveFile(): Promise<void> {
    if (pendingFile) {
      await deleteDoc(pendingFile);
    }
    setPendingFile(null);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────────
  function handleDragEnter(e: React.DragEvent<HTMLDivElement>): void {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current++;
    setDragOver(true);
  }
  function handleDragLeave(): void {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
    }
  }
  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
  }
  async function handleDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleAttachFile(file);
  }

  // ── Settings open ─────────────────────────────────────────────────────────────
  function openSettings(tab = "model"): void {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  // ── Logout ────────────────────────────────────────────────────────────────────
  async function handleLogout(): Promise<void> {
    await logout();
    window.location.href = "/login";
  }

  // ── Theme ─────────────────────────────────────────────────────────────────────
  function handleThemeToggle(): void {
    toggleTheme();
    setThemeSpinning(true);
  }

  if (user === undefined) return null;

  return (
    <div
      className="flex h-full overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={(e) => {
        void handleDrop(e);
      }}
    >
      {/* Sidebar */}
      <Sidebar onOpenSettings={openSettings} onNewChat={handleNewChat} />

      {/* Top-right fixed controls */}
      <div className="fixed right-0 top-[0.7rem] z-[51] flex items-stretch">
        <button
          onClick={() => {
            void handleLogout();
          }}
          title="Log out"
          className="bg-bg-surface border border-[#2a2a2a] border-r-0 rounded-l-[0.45rem] text-[#888] text-[1.05rem] leading-none px-[0.6rem] py-[0.45rem] cursor-pointer transition-all hover:text-[#e74c3c] hover:bg-[#2a1010]"
        >
          ⏻
        </button>
        <button
          onClick={handleThemeToggle}
          title="Toggle theme"
          onAnimationEnd={() => setThemeSpinning(false)}
          className={`bg-bg-surface border border-[#2a2a2a] rounded-r-[0.45rem] text-[#aaa] text-[1.05rem] leading-none px-[0.6rem] py-[0.45rem] cursor-pointer transition-all hover:text-txt-primary ${themeSpinning ? "theme-spinning" : ""}`}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      {/* Main content */}
      <div
        className={`flex flex-col flex-1 overflow-hidden min-w-0 main-transition ${sidebarOpen ? "ml-[280px]" : "ml-0"}`}
      >
        <Header onOpenSettings={openSettings} />

        <div
          className={`flex-1 flex flex-col overflow-hidden ${homeMode ? "justify-center" : ""}`}
        >
          {homeMode ? (
            <HomeHero
              onSend={(text) => {
                void handleSend(text);
              }}
            />
          ) : (
            <ChatArea
              pairs={pairs}
              loading={loading}
              onRetry={handleRetry}
              onEdit={handleEdit}
              errorMessages={errorMessages}
              onSpeak={speak}
              speakingId={speakingId}
            />
          )}

          <InputArea
            onSend={(text) => {
              void handleSend(text);
            }}
            onStop={handleStop}
            isStreaming={isStreaming}
            pendingFile={pendingFile}
            onRemoveFile={() => {
              void handleRemoveFile();
            }}
            onAttachFile={(file) => {
              void handleAttachFile(file);
            }}
            isRecording={isRecording}
            onToggleRecording={(fill) =>
              toggleRecording(
                fill ??
                  (() => {
                    /* noop */
                  }),
              )
            }
            tokenUsage={tokenUsage}
            webSearch={webSearch}
            onToggleWebSearch={() => {
              setWebSearch((prev) => {
                const next = !prev;
                localStorage.setItem("webSearch", String(next));
                return next;
              });
            }}
          />
        </div>
      </div>

      {/* Drop overlay */}
      {dragOver && (
        <div className="fixed inset-0 bg-accent/10 border-2 border-dashed border-accent rounded-[1rem] z-[200] flex items-center justify-center pointer-events-none m-3">
          <span className="bg-bg-base text-accent text-[1rem] font-semibold px-6 py-3 rounded-[0.75rem] border border-accent">
            Drop document here
          </span>
        </div>
      )}

      {/* Modals */}
      {settingsOpen && (
        <SettingsModal
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {docsOpen && (
        <DocsModal
          onClose={() => setDocsOpen(false)}
          onFileAttached={(name) => {
            setPendingFile(name);
            setDocsOpen(false);
          }}
        />
      )}
    </div>
  );
}
