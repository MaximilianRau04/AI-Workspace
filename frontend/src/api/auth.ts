import type { User } from "../types";

export async function getMe(): Promise<User | null> {
  const res = await fetch("/me");
  if (!res.ok) return null;
  return res.json() as Promise<User>;
}

export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; data: Record<string, string> }> {
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as Record<string, string>;
  return { ok: res.ok, data };
}

export async function register(
  username: string,
  password: string,
): Promise<{ ok: boolean; data: Record<string, string> }> {
  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as Record<string, string>;
  return { ok: res.ok, data };
}

export async function logout(): Promise<void> {
  await fetch("/logout", { method: "POST" });
}
