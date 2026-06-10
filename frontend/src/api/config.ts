import type { Config, Preset } from "../types";

export async function getConfig(): Promise<Config> {
  const res = await fetch("/config");
  return res.json() as Promise<Config>;
}

export async function saveSystemPrompt(
  systemPrompt: string,
): Promise<Record<string, unknown>> {
  const res = await fetch("/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_prompt: systemPrompt }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function saveModel(entry: {
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  reasoning: boolean;
}): Promise<Record<string, unknown>> {
  const res = await fetch("/config/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function savePresets(
  presets: Preset[],
): Promise<Record<string, unknown>> {
  const res = await fetch("/config/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function getOllamaModels(
  baseUrl: string,
): Promise<{ models: string[]; error?: string }> {
  const res = await fetch(
    `/config/ollama-models?base_url=${encodeURIComponent(baseUrl)}`,
  );
  return res.json() as Promise<{ models: string[]; error?: string }>;
}
