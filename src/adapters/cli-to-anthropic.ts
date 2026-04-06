import { Context } from 'hono';
import { StreamJsonEvent } from '../cli/types';
import { UsageInfo } from '../types';

export class AnthropicResponseAdapter {
  private model: string;
  private responseWriter?: WritableStreamDefaultWriter<Uint8Array>;
  private bufferedContent: any[] = [];
  private usage: UsageInfo = { input_tokens: 0, output_tokens: 0 };
  private messageId = '';
  private currentContentBlock: any = null;
  private isStreaming: boolean;
  private encoder: TextEncoder;

  constructor(model: string, writer?: WritableStreamDefaultWriter<Uint8Array>, isStreaming?: boolean) {
    this.model = model;
    this.responseWriter = writer;
    this.isStreaming = isStreaming || false;
    this.encoder = new TextEncoder();
  }

  handleEvent(event: StreamJsonEvent): void {
    if (event.type === 'message_start') {
      const evt = event as any;
      this.messageId = evt.message?.id || 'msg_' + Date.now();
      this.usage = evt.message?.usage || { input_tokens: 0, output_tokens: 0 };

      if (this.isStreaming) {
        this.sendEvent('message_start', {
          type: 'message_start',
          message: {
            id: this.messageId,
            type: 'message',
            role: 'assistant',
            model: this.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: this.usage,
          },
        });
      }
    } else if (event.type === 'content_block_start') {
      const evt = event as any;
      this.currentContentBlock = {
        type: evt.content_block.type,
        index: evt.index,
      };

      if (evt.content_block.type === 'text') {
        this.currentContentBlock.text = '';
      }

      if (this.isStreaming) {
        this.sendEvent('content_block_start', {
          type: 'content_block_start',
          index: evt.index,
          content_block: { type: evt.content_block.type },
        });
      }
    } else if (event.type === 'content_block_delta') {
      const evt = event as any;

      if (evt.delta.type === 'text_delta' && this.currentContentBlock) {
        this.currentContentBlock.text = (
          this.currentContentBlock.text || ''
        ) + (evt.delta.text || '');
      }

      if (this.isStreaming) {
        this.sendEvent('content_block_delta', {
          type: 'content_block_delta',
          index: evt.index,
          delta: evt.delta,
        });
      }
    } else if (event.type === 'content_block_stop') {
      const evt = event as any;

      if (this.currentContentBlock) {
        this.bufferedContent.push(this.currentContentBlock);
      }

      if (this.isStreaming) {
        this.sendEvent('content_block_stop', {
          type: 'content_block_stop',
          index: evt.index,
        });
      }

      this.currentContentBlock = null;
    } else if (event.type === 'message_delta') {
      const evt = event as any;
      if (evt.usage) {
        this.usage = evt.usage;
      }

      if (this.isStreaming) {
        this.sendEvent('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: evt.delta?.stop_reason || 'end_turn' },
          usage: this.usage,
        });
      }
    } else if (event.type === 'message_stop') {
      if (this.isStreaming) {
        this.sendEvent('message_stop', { type: 'message_stop' });
        this.writeData('[DONE]');
      }
    }
  }

  private sendEvent(eventType: string, data: any): void {
    const payload = JSON.stringify(data);
    this.writeData(`event: ${eventType}\ndata: ${payload}\n`);
  }

  private writeData(text: string): void {
    if (this.responseWriter) {
      this.responseWriter.write(this.encoder.encode(text + '\n'));
    }
  }

  getBufferedResponse(): any {
    return {
      id: this.messageId,
      type: 'message',
      role: 'assistant',
      model: this.model,
      content: this.bufferedContent,
      stop_reason: 'end_turn',
      usage: this.usage,
    };
  }
}
