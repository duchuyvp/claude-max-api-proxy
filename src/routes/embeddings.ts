import { Hono } from 'hono';
import { resolveModel } from '../config';

export function createEmbeddingsRoutes(): Hono {
  const router = new Hono();

  // OpenAI-compatible embeddings endpoint
  router.post('/v1/embeddings', async (ctx) => {
    const body = (ctx as any).body as any;

    // Validate input
    if (!body.input) {
      return ctx.json(
        { error: { message: 'input is required', type: 'invalid_request_error' } },
        { status: 400 }
      );
    }

    const model = resolveModel(body.model, (ctx as any).config);

    // Convert input to array if it's a string
    const inputs = Array.isArray(body.input) ? body.input : [body.input];

    // Generate mock embeddings (1536 dimensions to match OpenAI)
    // In a real implementation, you would call an embeddings API
    const embeddings = inputs.map((text: string, index: number) => ({
      object: 'embedding',
      index,
      embedding: generateMockEmbedding(text),
    }));

    return ctx.json({
      object: 'list',
      data: embeddings,
      model,
      usage: {
        prompt_tokens: inputs.reduce((sum: number, text: string) => sum + Math.ceil(text.length / 4), 0),
        total_tokens: inputs.reduce((sum: number, text: string) => sum + Math.ceil(text.length / 4), 0),
      },
    });
  });

  // Anthropic-compatible embeddings endpoint
  router.post('/v1/embed', async (ctx) => {
    const body = (ctx as any).body as any;

    if (!body.input) {
      return ctx.json(
        { error: { message: 'input is required', type: 'invalid_request_error' } },
        { status: 400 }
      );
    }

    const model = resolveModel(body.model, (ctx as any).config);
    const input = Array.isArray(body.input) ? body.input[0] : body.input;

    return ctx.json({
      embedding: generateMockEmbedding(input),
      model,
      usage: {
        input_tokens: Math.ceil((input as string).length / 4),
      },
    });
  });

  return router;
}

// Generate consistent mock embeddings for demo purposes
// In production, use actual embeddings model (e.g., all-MiniLM-L6-v2)
function generateMockEmbedding(text: string): number[] {
  const seed = text.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const embedding: number[] = [];

  for (let i = 0; i < 1536; i++) {
    const random = Math.sin(seed + i) * 10000;
    embedding.push((random - Math.floor(random)) * 2 - 1);
  }

  return embedding;
}
