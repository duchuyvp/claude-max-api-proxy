// Shared types for the entire application

export interface Config {
  models: Record<string, string>;
  defaultModel: string;
  port: number;
  host: string;
  requestTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  source?: { type: string; media_type?: string; data?: string; url?: string };
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
}

export interface APIRequest {
  model?: string;
  messages: Message[];
  system?: string;
  tools?: Tool[];
  tool_choice?: string | { type: string };
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: Record<string, unknown>;
  thinking?: { type: string; budget_tokens?: number };
}

export interface APIResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: ContentBlock[];
  stop_reason: string;
  usage: UsageInfo;
}

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface QueuedRequest {
  id: string;
  format: 'anthropic' | 'openai';
  data: APIRequest;
  timestamp: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}
