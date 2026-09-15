import type { McpAuth, McpTransport } from "../types";
import type { IconName } from "../components/settings/BrandIcon";

export interface McpPreset {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auth?: McpAuth;
  /** No secrets/paths needed, so add immediately on click instead of prefilling the form. */
  autoAdd?: boolean;
  /** Shown under the prefilled form so the user knows what to fill in / expect. */
  note?: string;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "github",
    name: "GitHub",
    icon: "github",
    description: "Browse and edit repos, issues, PRs",
    transport: "stdio",
    command: "docker",
    args: [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server",
    ],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    note: "Create a Personal Access Token at github.com/settings/tokens and paste it after the =.",
  },
  {
    id: "notion",
    name: "Notion",
    icon: "notion",
    description: "Read and edit Notion pages and databases",
    transport: "http",
    url: "https://mcp.notion.com/mcp",
    auth: "oauth",
    autoAdd: true,
    note: 'A "Sign in" button will appear below once it\'s added, to complete the OAuth login with Notion.',
  },
  {
    id: "slack",
    name: "Slack",
    icon: "slack",
    description: "Read and send messages in Slack channels",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    note: "Paste the bot token and team ID from your Slack app (api.slack.com/apps) after each =.",
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "gmail",
    description: "Read, search, and send emails",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
    note: "Needs your own Google Cloud OAuth credentials (credentials.json) and a browser login on the machine running the backend on first start. May not work on a headless server.",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    icon: "google-calendar",
    description: "Read and create calendar events",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@cocal/google-calendar-mcp"],
    note: "Needs your own Google Cloud OAuth credentials and a browser login on the machine running the backend on first start.",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    icon: "brave",
    description: "Web search via the Brave Search API",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    note: "Get a free API key at brave.com/search/api and paste it after the =.",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    icon: "folder",
    description: "Give the model read/write access to a local folder",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/folder"],
    note: "Replace the /path/to/folder placeholder with the folder you want to share.",
  },
  {
    id: "memory",
    name: "Memory",
    icon: "brain",
    description: "Persistent knowledge graph as long-term memory for the model",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    autoAdd: true,
  },
  {
    id: "puppeteer",
    name: "Browser control",
    icon: "puppeteer",
    description: "Visit, click, and screenshot pages via headless Chrome",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    autoAdd: true,
  },
];
