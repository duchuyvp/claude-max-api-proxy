import { StreamJsonEvent } from '../cli/types';

export class OpenAIResponseAdapter {
  private model: string;
  private responseWriter?: WritableStreamDefaultWriter<Uint8Array>;
  private bufferedContent = '';
  private isStreaming: boolean;
  private promptTokens = 0;
  private completionTokens = 0;
  private encoder: TextEncoder;

  constructor(model: string, writer?: WritableStreamDefaultWriter<Uint8Array>, isStreaming?: boolean) {
    this.model = model;
    this.responseWriter = writer;
    this.isStreaming = isStreaming || false;
    this.encoder = new TextEncoder();
  }

  handleEvent(event: StreamJsonEvent): void {
    if (event.type === 'message_start') {
      // Initialize
      const evt = event as any;
      if (evt.message?.usage) {
        this.promptTokens = evt.message.usage.input_tokens || 0;
      }
    } else if (event.type === 'content_block_delta') {
      const evt = event as any;

      if (evt.delta?.type === 'text_delta') {
        const text = evt.delta.text || '';
        this.bufferedContent += text;

        if (this.isStreaming) {
          const chunk = {
            id: `chatcmpl_${Date.now()}`,
            object: 'text_completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: this.model,
            choices: [
              {
                index: evt.index || 0,
                delta: { content: text },
                finish_reason: null,
              },
            ],
          };
          this.writeData(`data: ${JSON.stringify(chunk)}`);
        }
      }
    } else if (event.type === 'message_delta') {
      const evt = event as any;
      if (evt.usage) {
        this.completionTokens = evt.usage.output_tokens || 0;
      }
    } else if (event.type === 'message_stop') {
      if (this.isStreaming) {
        this.writeData('data: [DONE]');
      }
    }
  }

  private writeData(text: string): void {
    if (this.responseWriter) {
      this.responseWriter.write(this.encoder.encode(text + '\n\n'));
    }
  }

  getBufferedResponse(): any {
    return {
      id: `chatcmpl_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: this.bufferedContent,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: this.promptTokens,
        completion_tokens: this.completionTokens,
        total_tokens: this.promptTokens + this.completionTokens,
      },
    };
  }
}
