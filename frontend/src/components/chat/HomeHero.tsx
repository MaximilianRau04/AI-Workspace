interface HomeHeroProps {
  onSend: (text: string) => void;
}

const suggestions = [
  "Summarize a document for me",
  "Help me write a Python script",
  "Explain a concept step by step",
  "Review and improve my code",
];

export default function HomeHero({ onSend }: HomeHeroProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 pb-6 px-4 relative">
      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 55%, rgba(47,109,245,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Title */}
      <h1
        className="text-[2.2rem] font-bold text-center leading-tight tracking-[-0.025em] relative"
        style={{
          background:
            "linear-gradient(150deg, var(--txt-heading) 0%, var(--txt-muted) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        What can I help you with?
      </h1>

      {/* Suggestion chips */}
      <div className="flex flex-wrap items-center justify-center gap-[0.5rem] max-w-[600px] relative pointer-events-auto">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className="bg-bg-surface border border-border hover:border-accent/40 hover:bg-bg-hover text-txt-muted hover:text-txt-primary text-[0.8rem] font-medium px-[0.9rem] py-[0.5rem] rounded-full transition-all cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
