import { useEffect, useRef } from "react";
import MessagePair from "./MessagePair";
import type { ChatPair, StreamError } from "../../types";

function ChatSkeleton() {
  return (
    <div className="w-full max-w-[760px] flex flex-col gap-[1.4rem] py-6 pointer-events-none">
      <div className="flex flex-col items-end gap-[0.45rem]">
        <div className="skeleton-line" style={{ width: "52%" }} />
      </div>
      <div className="flex flex-col items-start gap-[0.45rem]">
        <div className="skeleton-line" style={{ width: "52%" }} />
        <div className="skeleton-line short" style={{ width: "34%" }} />
      </div>
      <div className="flex flex-col items-end gap-[0.45rem]">
        <div className="skeleton-line short" style={{ width: "34%" }} />
      </div>
      <div className="flex flex-col items-start gap-[0.45rem]">
        <div className="skeleton-line" style={{ width: "52%" }} />
        <div className="skeleton-line" style={{ width: "40%" }} />
        <div className="skeleton-line short" style={{ width: "20%" }} />
      </div>
    </div>
  );
}

interface ChatAreaProps {
  pairs: ChatPair[];
  loading: boolean;
  onRetry: (pairIndex: number, text: string) => void;
  onEdit: (pairIndex: number, newText: string) => void;
  errorMessages: StreamError[];
  onSpeak: (id: number, text: string) => void;
  speakingId: number | null;
}

export default function ChatArea({
  pairs,
  loading,
  onRetry,
  onEdit,
  errorMessages,
  onSpeak,
  speakingId,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [pairs]);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full overflow-y-auto px-6 pt-6 pb-3 flex flex-col items-center gap-4 scroll-smooth"
    >
      {loading ? (
        <ChatSkeleton />
      ) : (
        <>
          {pairs.map((pair) => (
            <MessagePair
              key={pair.pairIndex}
              pairIndex={pair.pairIndex}
              userText={pair.userText}
              attachedFile={pair.attachedFile}
              botText={pair.botText}
              isStreaming={pair.isStreaming}
              interrupted={pair.interrupted}
              thinkingText={pair.thinkingText}
              thinkingStreaming={pair.thinkingStreaming}
              thinkingElapsed={pair.thinkingElapsed}
              searchQuery={pair.searchQuery}
              codeResults={pair.codeResults}
              onRetry={onRetry}
              onEdit={onEdit}
              onSpeak={onSpeak}
              speaking={speakingId === pair.pairIndex}
            />
          ))}
          {errorMessages?.map((err, i) => (
            <div
              key={i}
              className="self-center flex items-start gap-3 bg-[#2a1010] border border-[#5a1f1f] text-[#e88] text-[0.875rem] rounded-[0.8rem] px-4 py-3 max-w-[480px]"
            >
              <span className="text-[1.1rem] leading-none mt-[1px] flex-shrink-0">
                {err.type === "rate_limit"
                  ? "⏳"
                  : err.type === "auth"
                    ? "🔑"
                    : "⚠️"}
              </span>
              <div className="min-w-0">
                <strong className="text-[#f66] block">{err.title}</strong>
                <span className="text-[#c77]">{err.detail}</span>
                {err.retry_after && (
                  <small className="text-[#a55] mt-1 block">
                    Try again in {err.retry_after}s
                  </small>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}
