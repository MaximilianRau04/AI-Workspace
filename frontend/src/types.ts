export interface User {
  user_id: string;
  username: string;
}

export interface MessagePart {
  role: "user" | "model";
  parts: string[];
}

export interface Session {
  id: string;
  title: string;
  updated_at: string;
}

export interface ChatDetail {
  id: string;
  title: string;
  messages: MessagePart[];
}

export interface ModelConfig {
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  reasoning: boolean;
  presets: Preset[];
}

export interface Preset {
  id: string;
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  reasoning: boolean;
}

export interface Config {
  system_prompt: string;
  model: ModelConfig;
}

export interface TokenUsage {
  prompt: number;
  reply: number;
}

export interface StreamError {
  type: string;
  title: string;
  detail: string;
  retry_after?: number;
}

export interface TitleEvent {
  id: string;
  title: string;
}

export interface ChatPair {
  pairIndex: number;
  userText: string;
  attachedFile: string | null;
  botText: string;
  isStreaming: boolean;
  thinkingText: string;
  thinkingStreaming: boolean;
  thinkingElapsed: number;
}
