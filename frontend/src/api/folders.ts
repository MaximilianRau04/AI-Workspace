import type { Folder } from "../types";

export async function getFolders(): Promise<{ folders: Folder[] }> {
  const res = await fetch("/folders");
  return res.json() as Promise<{ folders: Folder[] }>;
}

export async function createFolder(name: string): Promise<Folder> {
  const res = await fetch("/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json() as Promise<Folder>;
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export async function deleteFolder(
  id: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/folders/${id}`, { method: "DELETE" });
  return res.json() as Promise<Record<string, unknown>>;
}
