export async function getDocs(): Promise<{ files: string[] }> {
  const res = await fetch("/docs");
  return res.json() as Promise<{ files: string[] }>;
}

export async function uploadDoc(
  file: File,
): Promise<{ chunks?: number; error?: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/docs/upload", { method: "POST", body: form });
  return res.json() as Promise<{ chunks?: number; error?: string }>;
}

export async function deleteDoc(
  filename: string,
): Promise<Record<string, unknown>> {
  const res = await fetch("/docs/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: filename }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}
