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
    const queue = (ctx as any).queue;
    const subprocess = (ctx as any).subprocess;
    const config = (ctx as any).config;

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

    // Process via queue
    return new Promise<Response>((resolve) => {
      queue.setProcessor(async (req: QueuedRequest) => {
        let disconnected = false;

        try {
          // Create response stream writer for streaming responses
          let responseWriter: WritableStreamDefaultWriter<Uint8Array> | undefined;
          if (isStreaming) {
            const { writable, readable } = new TransformStream<Uint8Array>();
            responseWriter = writable.getWriter();

            // Start reading from readable stream and send response
            const response = new Response(readable, {
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
              },
            });

            resolve(response);
          }

          const adapter = new AnthropicResponseAdapter(
            model,
            responseWriter,
            isStreaming
          );

          // Run CLI subprocess
          const subprocessOpts: SubprocessOptions = {
            model,
            prompt: cliPrompt.prompt,
            system: cliPrompt.systemMessage,
            temperature: cliPrompt.temperature,
            maxTokens: cliPrompt.maxTokens,
            topP: cliPrompt.topP,
            topK: cliPrompt.topK,
            stopSequences: cliPrompt.stopSequences,
            thinking: cliPrompt.thinking,
            timeout: config.requestTimeoutMs,
          };

          await subprocess.run(subprocessOpts, (event: StreamJsonEvent) => {
            if (!disconnected) {
              adapter.handleEvent(event);
            }
          });

          // Send non-streaming response
          if (!isStreaming && !disconnected) {
            const response = adapter.getBufferedResponse();
            resolve(ctx.json(response));
          }

          // Close response writer if streaming
          if (isStreaming && responseWriter && !disconnected) {
            try {
              await responseWriter.close();
            } catch {
              // Writer may already be closed
            }
          }

          req.resolve(null);
        } catch (error) {
          disconnected = true;
          if (!isStreaming) {
            const response = ctx.json(
              {
                error: {
                  message: (error as Error).message,
                  type: 'internal_error',
                },
              },
              { status: 500 }
            );
            resolve(response);
          }
          req.reject(error);
        }
      });

      queue.enqueue('anthropic', body);
    });
  });

  return router;
}
