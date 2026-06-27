import { useRef, useCallback } from "react";
import { streamMessage } from "../api/chats";
import type { CodeResult, TokenUsage, StreamError, TitleEvent } from "../types";

interface StreamCallbacks {
  onChunk?: (char: string, fullText: string) => void;
  onThinking?: (chunk: string) => void;
  onSearching?: (query: string) => void;
  onExecuting?: (info: { language: string; code: string }) => void;
  onCodeResult?: (result: CodeResult) => void;
  onDone?: (fullText: string) => void;
  onTitle?: (id: string, title: string) => void;
  onUsage?: (payload: TokenUsage) => void;
  onError?: (payload: StreamError) => void;
  onFlush?: (text: string, thinking: string) => void;
}

/**
 * useStream — drives SSE streaming for chat messages.
 *
 * Returns { stream, abort }
 *
 * stream(chatId, message, attachedFile, pairIndex, callbacks)
 *   callbacks: {
 *     onChunk(char, fullText)   — raw chunk from server
 *     onThinking(chunk)         — thinking block chunk
 *     onDone(fullText)          — stream complete, passes accumulated text
 *     onTitle(id, title)        — auto-generated title
 *     onUsage(payload)          — token counts
 *     onError(payload)          — error event
 *   }
 */
export function useStream(): {
  stream: (
    chatId: string,
    message: string,
    attachedFile: string | null,
    pairIndex: number | null,
    callbacks: StreamCallbacks,
    webSearch?: boolean,
    codeInterpreter?: boolean,
  ) => Promise<void>;
  abort: () => void;
} {
  const abortRef = useRef<AbortController | null>(null);
  const accRef = useRef<string>("");
  const thinkRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const abort = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const stream = useCallback(
    async (
      chatId: string,
      message: string,
      attachedFile: string | null,
      pairIndex: number | null,
      callbacks: StreamCallbacks,
      webSearch: boolean = false,
      codeInterpreter: boolean = false,
    ): Promise<void> => {
      const {
        onChunk,
        onThinking,
        onSearching,
        onExecuting,
        onCodeResult,
        onDone,
        onTitle,
        onUsage,
        onError,
        onFlush,
      } = callbacks;

      const controller = new AbortController();
      abortRef.current = controller;
      accRef.current = "";
      thinkRef.current = "";

      if (onFlush) {
        timerRef.current = setInterval(() => {
          onFlush(accRef.current, thinkRef.current);
        }, 50);
      }

      try {
        const res = await streamMessage(
          chatId,
          message,
          attachedFile,
          pairIndex,
          controller.signal,
          webSearch,
          codeInterpreter,
        );

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "message";
        let stopped = false;

        const charDelay = parseInt(
          localStorage.getItem("streamDelay") ?? "8",
          10,
        );

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) continue;

            let payload: unknown;
            try {
              payload = JSON.parse(line.slice(6));
            } catch {
              payload = line.slice(6);
            }

            if (eventType === "usage") {
              onUsage?.(payload as TokenUsage);
              eventType = "message";
              continue;
            }
            if (eventType === "error") {
              onError?.(payload as StreamError);
              stopped = true;
              eventType = "message";
              break;
            }
            if (eventType === "title") {
              const ev = payload as TitleEvent;
              onTitle?.(ev.id, ev.title);
              eventType = "message";
              continue;
            }
            if (eventType === "thinking") {
              thinkRef.current += payload as string;
              onThinking?.(payload as string);
              eventType = "message";
              continue;
            }
            if (eventType === "searching") {
              onSearching?.(payload as string);
              eventType = "message";
              continue;
            }
            if (eventType === "executing") {
              onExecuting?.(payload as { language: string; code: string });
              eventType = "message";
              continue;
            }
            if (eventType === "code_result") {
              onCodeResult?.(payload as import("../types").CodeResult);
              eventType = "message";
              continue;
            }

            eventType = "message";

            if (payload === "[DONE]") {
              onDone?.(accRef.current);
              stopped = true;
              break;
            }

            const chunk = payload as string;

            if (charDelay === 0) {
              accRef.current += chunk;
              onChunk?.(chunk, accRef.current);
            } else {
              for (const char of chunk) {
                if (controller.signal.aborted) {
                  stopped = true;
                  break;
                }
                accRef.current += char;
                onChunk?.(char, accRef.current);
                await new Promise<void>((r) => setTimeout(r, charDelay));
              }
            }
          }
        }
      } catch (e) {
        const err = e as Error;
        if (err.name !== "AbortError") {
          onError?.({
            type: "error",
            title: "Connection error",
            detail: err.message,
          });
        }
      } finally {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          onFlush?.(accRef.current, thinkRef.current);
        }
        abortRef.current = null;
      }
    },
    [],
  );

  return { stream, abort };
}
