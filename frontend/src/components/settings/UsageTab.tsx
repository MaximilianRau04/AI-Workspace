import { useEffect, useState } from "react";
import { getUsageSummary, getPricing, savePricing } from "../../api/usage";
import type { PriceRate, UsageSummary } from "../../types";
import { labelCls } from "./styles";

const priceInputCls =
  "w-20 bg-bg-surface border border-border rounded-md text-txt-primary text-[0.8rem] px-2 py-1 outline-none focus:border-accent disabled:opacity-60";

interface UsageTabProps {
  isAdmin: boolean;
}

export default function UsageTab({ isAdmin }: UsageTabProps) {
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [pricing, setPricing] = useState<Record<string, PriceRate>>({});
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);

  function reloadUsage(): void {
    getUsageSummary().then(setUsageSummary);
    getPricing().then((data) => setPricing(data.pricing || {}));
  }

  useEffect(() => {
    reloadUsage();
  }, []);

  function updatePricingField(
    key: string,
    field: "input" | "output",
    value: string,
  ): void {
    const num = value === "" ? 0 : Number(value);
    setPricing((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { input: 0, output: 0 }), [field]: num },
    }));
  }

  async function handleSavePricing(): Promise<void> {
    setPricingBusy(true);
    try {
      await savePricing(pricing);
      reloadUsage();
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 1500);
    } finally {
      setPricingBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.75rem] text-[#555]">
        Token usage is tracked automatically per message. Cost is only an
        estimate: enter your provider's current $/1M token price below per
        model; it's never fetched automatically and may go stale.
      </p>

      {!usageSummary ? (
        <p className="text-[0.8rem] text-txt-dim">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { label: "Today", v: usageSummary.today },
                { label: "7 days", v: usageSummary.last_7d },
                { label: "30 days", v: usageSummary.last_30d },
                { label: "All time", v: usageSummary.all_time },
              ] as const
            ).map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1 bg-bg-base border border-border rounded-[0.6rem] px-3 py-2"
              >
                <span className="text-[0.7rem] text-txt-dim">{s.label}</span>
                <span className="text-[0.95rem] text-txt-primary font-medium tabular-nums">
                  {s.v.total.toLocaleString("en")}
                </span>
                <span className="text-[0.68rem] text-txt-dim">tokens</span>
              </div>
            ))}
          </div>

          {usageSummary.all_time_cost_usd > 0 && (
            <p className="text-[0.8rem] text-txt-primary">
              Estimated all-time cost:{" "}
              <span className="font-medium">
                ${usageSummary.all_time_cost_usd.toFixed(4)}
              </span>
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <label className={labelCls}>By model</label>
            {usageSummary.by_model.length === 0 && (
              <p className="text-[0.8rem] text-txt-dim">
                No usage recorded yet.
              </p>
            )}
            {usageSummary.by_model.map((m) => {
              const key = `${m.provider}::${m.model}`;
              const rate = pricing[key] || { input: 0, output: 0 };
              return (
                <div
                  key={key}
                  className="flex flex-col gap-2 bg-bg-base border border-border rounded-[0.6rem] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[0.85rem] text-txt-primary font-medium truncate">
                      {m.model}
                    </span>
                    <span className="text-[0.72rem] text-txt-dim">
                      {m.requests} request
                      {m.requests === 1 ? "" : "s"} ·{" "}
                      {m.total.toLocaleString("en")} tokens
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-[0.72rem] text-txt-dim">
                      $/1M in
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rate.input || ""}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          updatePricingField(key, "input", e.target.value)
                        }
                        className={priceInputCls}
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[0.72rem] text-txt-dim">
                      $/1M out
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rate.output || ""}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          updatePricingField(key, "output", e.target.value)
                        }
                        className={priceInputCls}
                      />
                    </label>
                    <span className="text-[0.72rem] text-txt-dim ml-auto">
                      ≈ ${m.cost_usd.toFixed(4)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {isAdmin && usageSummary.by_model.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void handleSavePricing();
              }}
              disabled={pricingBusy}
              className="self-start bg-bg-muted hover:bg-bg-hover disabled:opacity-50 border border-border rounded-lg text-txt-primary px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
            >
              {pricingBusy
                ? "Saving…"
                : pricingSaved
                  ? "Saved ✓"
                  : "Save pricing"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
