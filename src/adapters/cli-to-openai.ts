export class OpenAIResponseAdapter {
  private model: string;
  private responseWriter?: WritableStreamDefaultWriter<Uint8Array>;
  private encoder = new TextEncoder();

  constructor(model: string, writer?: WritableStreamDefaultWriter<Uint8Array>) {
    this.model = model;
    this.responseWriter = writer;
  }

  writeStreamChunk(text: string): void {
    if (!this.responseWriter) return;
    const chunk = {
      id: `chatcmpl_${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          delta: { content: text },
          finish_reason: null,
        },
      ],
    };
    this.responseWriter.write(
      this.encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
    );
  }

  writeStreamEnd(): void {
    if (!this.responseWriter) return;
    this.responseWriter.write(this.encoder.encode('data: [DONE]\n\n'));
  }

  buildNonStreamingResponse(
    fullText: string,
    messageId: string,
    usage: { input_tokens: number; output_tokens: number }
  ): any {
    return {
      id: `chatcmpl_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: fullText },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.input_tokens + usage.output_tokens,
      },
    };
  }
}
