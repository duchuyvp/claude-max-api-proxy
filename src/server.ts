import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Config } from './types';
import { AgentRunner } from './agent/runner';

export function createServer(config: Config, agent: AgentRunner): Hono {
  const app = new Hono();

  // Middleware
  app.use(logger());
  app.use('*', cors());

  // JSON body parser
  app.use(async (ctx, next) => {
    if (ctx.req.method === 'POST') {
      try {
        const body = await ctx.req.json();
        (ctx as any).body = body;
      } catch {
        return ctx.json({ error: 'Invalid JSON' }, { status: 400 });
      }
    }
    await next();
  });

  // Health check
  app.get('/health', (ctx) => {
    return ctx.json({
      status: 'ok',
      version: '3.0.0',
      uptime: process.uptime(),
    });
  });

  // Store agent and config in context for routes
  app.use(async (ctx, next) => {
    (ctx as any).agent = agent;
    (ctx as any).config = config;
    await next();
  });

  return app;
}
