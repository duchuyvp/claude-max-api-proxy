export interface AgentRunOptions {
  model: string;
  prompt: string;
  system?: string;
  timeout?: number;
}

export interface AgentTextChunk {
  type: 'text';
  text: string;
}

export interface AgentDone {
  type: 'done';
  messageId: string;
  model: string;
  stopReason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  fullText: string;
}

export type AgentEvent = AgentTextChunk | AgentDone;
