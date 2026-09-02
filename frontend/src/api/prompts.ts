import type { Prompt } from "../types";

export async function getPrompts(): Promise<{ prompts: Prompt[] }> {
  const res = await fetch("/prompts");
  return res.json() as Promise<{ prompts: Prompt[] }>;
}

export async function createPrompt(
  name: string,
  content: string,
): Promise<Prompt> {
  const res = await fetch("/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  return res.json() as Promise<Prompt>;
}

export async function updatePrompt(
  id: string,
  name: string,
  content: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/prompts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function deletePrompt(
  id: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/prompts/${id}`, { method: "DELETE" });
  return res.json() as Promise<Record<string, unknown>>;
}
