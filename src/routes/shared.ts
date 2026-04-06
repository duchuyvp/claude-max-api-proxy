import { Hono } from 'hono';
import { Config } from '../types';

// Model metadata with correct context windows
// Source: https://platform.claude.com/docs/en/about-claude/models/overview
const MODEL_METADATA: Record<string, { context_window: number; max_tokens: number }> = {
  'claude-opus-4-6': { context_window: 1000000, max_tokens: 4096 },
  'claude-sonnet-4-6': { context_window: 1000000, max_tokens: 4096 },
  'claude-haiku-4-5-20251001': { context_window: 200000, max_tokens: 4096 },
};

export function createSharedRoutes(): Hono {
  const router = new Hono();

  router.get('/v1/models', (ctx) => {
    const config = (ctx as any).config as Config;

    // Detect format from Accept header or query param
    const format =
      ctx.req.query('format') ||
      (ctx.req.header('Accept')?.includes('openai') ? 'openai' : 'anthropic');

    const models = Object.values(config.models);
    const uniqueModels = [...new Set(models)];

    if (format === 'openai') {
      return ctx.json({
        object: 'list',
        data: uniqueModels.map((model) => ({
          id: model,
          object: 'model',
          owned_by: 'anthropic',
          permission: [],
          context_window: MODEL_METADATA[model]?.context_window || 200000,
        })),
      });
    }

    // Anthropic format
    return ctx.json({
      data: uniqueModels.map((model) => ({
        id: model,
        type: 'model',
        display_name: model,
        context_window: MODEL_METADATA[model]?.context_window || 200000,
      })),
    });
  });

  return router;
}
