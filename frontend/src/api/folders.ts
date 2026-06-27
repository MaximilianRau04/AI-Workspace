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

export async function getFolderDocs(
  folderId: string,
): Promise<{ files: string[] }> {
  const res = await fetch(`/folders/${folderId}/docs`);
  return res.json() as Promise<{ files: string[] }>;
}

export async function uploadFolderDoc(
  folderId: string,
  file: File,
): Promise<{ file: string; chunks: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/folders/${folderId}/docs/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json()) as { detail?: string };
    throw new Error(err.detail ?? "Upload failed");
  }
  return res.json() as Promise<{ file: string; chunks: number }>;
}

export async function deleteFolderDoc(
  folderId: string,
  filename: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/folders/${folderId}/docs/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: filename }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}
