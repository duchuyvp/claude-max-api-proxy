import { Hono } from 'hono';
import { Config } from '../types';

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
        })),
      });
    }

    // Anthropic format
    return ctx.json({
      data: uniqueModels.map((model) => ({
        id: model,
        type: 'model',
        display_name: model,
      })),
    });
  });

  return router;
}
