import { Hono } from 'hono';
import { OpenAIResponseAdapter } from '../adapters/cli-to-openai';
import { AgentRunner } from '../agent/runner';
import { resolveModel } from '../config';
import { APIRequest } from '../types';

function extractPrompt(body: APIRequest): { prompt: string; system?: string } {
  let system = '';
  let prompt = '';

  for (const msg of body.messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('')
        : '';

    if (msg.role === 'system') {
      system = content;
    } else if (msg.role === 'user') {
      prompt += `User: ${content}\n\n`;
    } else if (msg.role === 'assistant') {
      prompt += `Assistant: ${content}\n\n`;
    }
  }

  return { prompt: prompt || 'Continue.', system: system || undefined };
}

export function createOpenAIRoutes(): Hono {
  const router = new Hono();

  router.post('/v1/chat/completions', async (ctx) => {
    const body = (ctx as any).body as APIRequest;
    const agent = (ctx as any).agent as AgentRunner;
    const config = (ctx as any).config;

    if (!body || !body.messages) {
      return ctx.json({ error: 'No messages provided' }, { status: 400 });
    }

    const model = resolveModel(body.model, config);
    const isStreaming = body.stream ?? false;
    const { prompt, system } = extractPrompt(body);

    try {
      if (isStreaming) {
        const { writable, readable } = new TransformStream<Uint8Array>();
        const writer = writable.getWriter();
        const adapter = new OpenAIResponseAdapter(model, writer);

        const response = new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });

        (async () => {
          try {
            for await (const event of agent.run({ model, prompt, system, timeout: config.requestTimeoutMs })) {
              if (event.type === 'text') {
                adapter.writeStreamChunk(event.text);
              } else if (event.type === 'done') {
                adapter.writeStreamEnd();
              }
            }
            await writer.close();
          } catch {
            try { await writer.close(); } catch {}
          }
        })();

        return response;
      }

      // Non-streaming
      let fullText = '';
      let messageId = '';
      let usage = { input_tokens: 0, output_tokens: 0 };

      for await (const event of agent.run({ model, prompt, system, timeout: config.requestTimeoutMs })) {
        if (event.type === 'text') {
          fullText += event.text;
        } else if (event.type === 'done') {
          messageId = event.messageId;
          usage = event.usage;
        }
      }

      const adapter = new OpenAIResponseAdapter(model);
      return ctx.json(adapter.buildNonStreamingResponse(fullText, messageId, usage));
    } catch (error) {
      return ctx.json(
        { error: { message: (error as Error).message, type: 'server_error' } },
        { status: 500 }
      );
    }
  });

  return router;
}
