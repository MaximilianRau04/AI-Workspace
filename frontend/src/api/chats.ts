import type { Session, ChatDetail } from "../types";

export async function getChats(): Promise<{ chats: Session[] }> {
  const res = await fetch("/chats");
  return res.json() as Promise<{ chats: Session[] }>;
}

export async function createChat(): Promise<{ id: string }> {
  const res = await fetch("/chats", { method: "POST" });
  return res.json() as Promise<{ id: string }>;
}

export async function getChat(id: string): Promise<ChatDetail> {
  const res = await fetch(`/chats/${id}`);
  return res.json() as Promise<ChatDetail>;
}

export async function renameChat(
  id: string,
  title: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/chats/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function deleteChat(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/chats/${id}`, { method: "DELETE" });
  return res.json() as Promise<Record<string, unknown>>;
}

export function streamMessage(
  chatId: string,
  message: string,
  attachedFile: string | null,
  pairIndex: number | null | undefined,
  signal: AbortSignal,
  webSearch: boolean = false,
): Promise<Response> {
  const body: Record<string, unknown> = {
    message,
    attached_file: attachedFile ?? null,
    web_search: webSearch,
  };
  if (pairIndex !== null && pairIndex !== undefined)
    body.pair_index = pairIndex;
  return fetch(`/chats/${chatId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
