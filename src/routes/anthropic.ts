import { Hono } from 'hono';
import { AnthropicResponseAdapter } from '../adapters/cli-to-anthropic';
import { AgentRunner } from '../agent/runner';
import { resolveModel } from '../config';
import { APIRequest } from '../types';

function extractSystemText(system: any): string {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text || '')
      .join('\n');
  }
  return '';
}

function extractPrompt(body: APIRequest): { prompt: string; system?: string } {
  let system = extractSystemText(body.system);
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

export function createAnthropicRoutes(): Hono {
  const router = new Hono();

  router.post('/v1/messages', async (ctx) => {
    const body = (ctx as any).body as APIRequest;
    const agent = (ctx as any).agent as AgentRunner;
    const config = (ctx as any).config;

    if (!body || !body.messages) {
      return ctx.json({ error: 'No messages provided' }, { status: 400 });
    }

    const model = resolveModel(body.model, config);
    const isStreaming = body.stream ?? false;
    const { prompt, system } = extractPrompt(body);
    const tools = body.tools;
    const toolUseIds = new Set<string>();

    try {
      if (isStreaming) {
        const { writable, readable } = new TransformStream<Uint8Array>();
        const writer = writable.getWriter();
        const adapter = new AnthropicResponseAdapter(model, writer);

        const response = new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });

        (async () => {
          try {
            let messageId = 'msg_' + Date.now();
            let usage = { input_tokens: 0, output_tokens: 0 };
            let stopReason = 'end_turn';

            for await (const event of agent.run({ model, prompt, system, tools, timeout: config.requestTimeoutMs })) {
              if (event.type === 'text') {
                adapter.writeStreamChunk(event.text, messageId, usage);
              } else if (event.type === 'tool_use') {
                if (!toolUseIds.has(event.id)) {
                  toolUseIds.add(event.id);
                  adapter.writeStreamToolUse(event.id, event.name, event.input, messageId, usage);
                }
              } else if (event.type === 'done') {
                messageId = event.messageId;
                usage = event.usage;
                stopReason = event.stopReason;
                adapter.writeStreamEnd(stopReason, usage);
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
      const adapter = new AnthropicResponseAdapter(model);
      let messageId = '';
      let stopReason = 'end_turn';
      let usage = { input_tokens: 0, output_tokens: 0 };

      for await (const event of agent.run({ model, prompt, system, tools, timeout: config.requestTimeoutMs })) {
        if (event.type === 'text') {
          adapter.addContentBlock({ type: 'text', text: event.text });
        } else if (event.type === 'tool_use') {
          if (!toolUseIds.has(event.id)) {
            toolUseIds.add(event.id);
            adapter.addContentBlock({
              type: 'tool_use',
              id: event.id,
              name: event.name,
              input: event.input,
            });
          }
        } else if (event.type === 'done') {
          messageId = event.messageId;
          stopReason = event.stopReason;
          usage = event.usage;
        }
      }

      return ctx.json(adapter.buildNonStreamingResponse(messageId, model, stopReason, usage));
    } catch (error) {
      return ctx.json(
        { error: { message: (error as Error).message, type: 'server_error' } },
        { status: 500 }
      );
    }
  });

  return router;
}
