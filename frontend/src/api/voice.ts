export async function tts(text: string): Promise<Blob> {
  const res = await fetch("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("TTS failed");
  return res.blob();
}

export async function stt(audioBlob: Blob): Promise<{ text?: string }> {
  const form = new FormData();
  form.append("audio", audioBlob, "audio.webm");
  const res = await fetch("/stt", { method: "POST", body: form });
  return res.json() as Promise<{ text?: string }>;
}
