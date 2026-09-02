import type { PriceRate, UsageSummary } from "../types";

export async function getUsageSummary(): Promise<UsageSummary> {
  const res = await fetch("/usage/summary");
  return res.json() as Promise<UsageSummary>;
}

export async function getPricing(): Promise<{
  pricing: Record<string, PriceRate>;
}> {
  const res = await fetch("/usage/pricing");
  return res.json() as Promise<{ pricing: Record<string, PriceRate> }>;
}

export async function savePricing(
  pricing: Record<string, PriceRate>,
): Promise<Record<string, unknown>> {
  const res = await fetch("/usage/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pricing }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}
