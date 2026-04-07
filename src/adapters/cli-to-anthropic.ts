export class AnthropicResponseAdapter {
  private model: string;
  private responseWriter?: WritableStreamDefaultWriter<Uint8Array>;
  private encoder = new TextEncoder();
  private messageStartSent = false;
  private contentIndex = 0;
  private contentBlocks: any[] = [];

  constructor(model: string, writer?: WritableStreamDefaultWriter<Uint8Array>) {
    this.model = model;
    this.responseWriter = writer;
  }

  sendMessageStart(messageId: string, usage: { input_tokens: number; output_tokens: number }): void {
    if (!this.responseWriter || this.messageStartSent) return;
    this.messageStartSent = true;
    this.sendEvent('message_start', {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model: this.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage,
      },
    });
  }

  writeStreamChunk(text: string, messageId: string, usage: { input_tokens: number; output_tokens: number }): void {
    if (!this.responseWriter) return;

    this.sendMessageStart(messageId, usage);

    this.sendEvent('content_block_start', {
      type: 'content_block_start',
      index: this.contentIndex,
      content_block: { type: 'text' },
    });

    this.sendEvent('content_block_delta', {
      type: 'content_block_delta',
      index: this.contentIndex,
      delta: { type: 'text_delta', text },
    });

    this.sendEvent('content_block_stop', {
      type: 'content_block_stop',
      index: this.contentIndex,
    });

    this.contentIndex++;
  }

  writeStreamToolUse(
    toolId: string,
    toolName: string,
    toolInput: any,
    messageId: string,
    usage: { input_tokens: number; output_tokens: number }
  ): void {
    if (!this.responseWriter) return;

    this.sendMessageStart(messageId, usage);

    this.sendEvent('content_block_start', {
      type: 'content_block_start',
      index: this.contentIndex,
      content_block: { type: 'tool_use', id: toolId, name: toolName, input: {} },
    });

    this.sendEvent('content_block_delta', {
      type: 'content_block_delta',
      index: this.contentIndex,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) },
    });

    this.sendEvent('content_block_stop', {
      type: 'content_block_stop',
      index: this.contentIndex,
    });

    this.contentIndex++;
  }

  writeStreamEnd(stopReason: string, usage: { input_tokens: number; output_tokens: number }): void {
    if (!this.responseWriter) return;
    this.sendEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage,
    });
    this.sendEvent('message_stop', { type: 'message_stop' });
  }

  addContentBlock(block: any): void {
    this.contentBlocks.push(block);
  }

  buildNonStreamingResponse(
    messageId: string,
    model: string,
    stopReason: string,
    usage: { input_tokens: number; output_tokens: number }
  ): any {
    return {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: this.contentBlocks,
      stop_reason: stopReason,
      usage,
    };
  }

  private sendEvent(eventType: string, data: any): void {
    this.writeData(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n`);
  }

  private writeData(text: string): void {
    if (this.responseWriter) {
      this.responseWriter.write(this.encoder.encode(text + '\n'));
    }
  }
}
