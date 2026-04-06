import {
  StreamJsonEvent,
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
  ErrorEvent,
} from './types';

export type EventHandler = (event: StreamJsonEvent) => void;

export class StreamParser {
  private buffer = '';
  private onEvent: EventHandler;

  constructor(onEvent: EventHandler) {
    this.onEvent = onEvent;
  }

  processChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line) as StreamJsonEvent;
          this.onEvent(event);
        } catch (e) {
          // Silently skip non-JSON lines (system output, etc.)
          // Only emit event if this looks like it should be parsed
          if (line.startsWith('{')) {
            console.error(`Failed to parse JSON: ${line}`, e);
            this.onEvent({
              type: 'parse_error',
              error: (e as Error).message,
              raw: line,
            });
          }
        }
      }
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      try {
        const event = JSON.parse(this.buffer) as StreamJsonEvent;
        this.onEvent(event);
      } catch (e) {
        console.error(`Failed to parse final JSON: ${this.buffer}`, e);
      }
    }
    this.buffer = '';
  }
}
