export interface ClientTool {
  name: string;
  description?: string;
  input_schema?: any;
}

export interface AgentRunOptions {
  model: string;
  prompt: string;
  system?: string;
  tools?: ClientTool[];
  timeout?: number;
}

export interface AgentTextChunk {
  type: 'text';
  text: string;
}

export interface AgentToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
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

export type AgentEvent = AgentTextChunk | AgentToolUse | AgentDone;
