import type { McpServer, McpTransport } from "../types";

export async function getMcpServers(): Promise<{ servers: McpServer[] }> {
  const res = await fetch("/mcp/servers");
  return res.json() as Promise<{ servers: McpServer[] }>;
}

export async function addMcpServer(entry: {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}): Promise<McpServer> {
  const res = await fetch("/mcp/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return res.json() as Promise<McpServer>;
}

export async function updateMcpServer(
  id: string,
  updates: Partial<{
    name: string;
    enabled: boolean;
    transport: McpTransport;
    command: string;
    args: string[];
    env: Record<string, string>;
    url: string;
    headers: Record<string, string>;
  }>,
): Promise<McpServer> {
  const res = await fetch(`/mcp/servers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return res.json() as Promise<McpServer>;
}

export async function deleteMcpServer(
  id: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/mcp/servers/${id}`, { method: "DELETE" });
  return res.json() as Promise<Record<string, unknown>>;
}
