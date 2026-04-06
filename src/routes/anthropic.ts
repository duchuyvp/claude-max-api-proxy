import { Hono } from 'hono';
import { anthropicToCli } from '../adapters/anthropic-to-cli';
import { AnthropicResponseAdapter } from '../adapters/cli-to-anthropic';
import { SubprocessOptions } from '../cli/subprocess';
import { StreamJsonEvent } from '../cli/types';
import { resolveModel } from '../config';
import { APIRequest, QueuedRequest } from '../types';

export function createAnthropicRoutes(): Hono {
  const router = new Hono();

  router.post('/v1/messages', async (ctx) => {
    const body = (ctx as any).body as APIRequest;
    const subprocess = (ctx as any).subprocess;
    const config = (ctx as any).config;

    if (!body || !body.messages) {
      return ctx.json({ error: 'No messages provided' }, { status: 400 });
    }

    const model = resolveModel(body.model, config);
    const isStreaming = body.stream ?? false;

    // Convert API request to CLI format
    const cliPrompt = anthropicToCli(body);

    // Set up response headers
    if (isStreaming) {
      ctx.header('Content-Type', 'text/event-stream');
      ctx.header('Cache-Control', 'no-cache');
      ctx.header('Connection', 'keep-alive');
    } else {
      ctx.header('Content-Type', 'application/json');
    }

    // Don't use queue for now - just process directly
    // TODO: If multiple concurrent requests needed, implement proper request queueing
    let disconnected = false;

    try {
      // Create response stream writer for streaming responses
      let responseWriter: WritableStreamDefaultWriter<Uint8Array> | undefined;
      if (isStreaming) {
        const { writable, readable } = new TransformStream<Uint8Array>();
        responseWriter = writable.getWriter();

        // Return streaming response immediately
        const response = new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });

        // Process in background
        (async () => {
          try {
            const adapter = new AnthropicResponseAdapter(
              model,
              responseWriter,
              isStreaming
            );

            const subprocessOpts: SubprocessOptions = {
              model,
              prompt: cliPrompt.prompt,
              system: cliPrompt.systemMessage,
              timeout: config.requestTimeoutMs,
            };

            await subprocess.run(subprocessOpts, (event: StreamJsonEvent) => {
              if (!disconnected) {
                adapter.handleEvent(event);
              }
            });

            if (responseWriter && !disconnected) {
              await responseWriter.close();
            }
          } catch (error) {
            disconnected = true;
            if (responseWriter) {
              try {
                await responseWriter.close();
              } catch {
                // Already closed
              }
            }
          }
        })();

        return response;
      }

      // Non-streaming response
      const adapter = new AnthropicResponseAdapter(model, undefined, false);

      const subprocessOpts: SubprocessOptions = {
        model,
        prompt: cliPrompt.prompt,
        system: cliPrompt.systemMessage,
        timeout: config.requestTimeoutMs,
      };

      await subprocess.run(subprocessOpts, (event: StreamJsonEvent) => {
        if (!disconnected) {
          adapter.handleEvent(event);
        }
      });

      if (!disconnected) {
        const response = adapter.getBufferedResponse();
        return ctx.json(response);
      }

      // If disconnected, return error
      return ctx.json(
        {
          error: {
            message: 'Request was disconnected',
            type: 'client_error',
          },
        },
        { status: 500 }
      );
    } catch (error) {
      return ctx.json(
        {
          error: {
            message: (error as Error).message,
            type: 'internal_error',
          },
        },
        { status: 500 }
      );
    }
  });

  return router;
}
