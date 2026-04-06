// Types for Claude CLI stream-json output

export interface StreamJsonEvent {
  type: string;
  [key: string]: unknown;
}

export interface MessageStartEvent extends StreamJsonEvent {
  type: 'message_start';
  message: {
    id: string;
    type: string;
    role: string;
    model: string;
    content: unknown[];
    stop_reason: null;
    stop_sequence: null;
    usage: { input_tokens: number; output_tokens: number };
  };
}

export interface ContentBlockStartEvent extends StreamJsonEvent {
  type: 'content_block_start';
  index: number;
  content_block: { type: string; text?: string };
}

export interface ContentBlockDeltaEvent extends StreamJsonEvent {
  type: 'content_block_delta';
  index: number;
  delta: { type: string; text?: string };
}

export interface ContentBlockStopEvent extends StreamJsonEvent {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaEvent extends StreamJsonEvent {
  type: 'message_delta';
  delta: { stop_reason: string; stop_sequence: null };
  usage: { output_tokens: number };
}

export interface MessageStopEvent extends StreamJsonEvent {
  type: 'message_stop';
}

export interface ErrorEvent extends StreamJsonEvent {
  type: 'error';
  error: { message: string; code?: string };
}
