import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Config } from './types';
import { RequestQueue } from './queue';
import { CLISubprocess } from './cli/subprocess';
import { SessionManager } from './cli/session';

export function createServer(
  config: Config,
  queue: RequestQueue,
  subprocess: CLISubprocess,
  sessionManager: SessionManager
): Hono {
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
        return ctx.json(
          { error: 'Invalid JSON' },
          { status: 400 }
        );
      }
    }
    await next();
  });

  // Health check
  app.get('/health', (ctx) => {
    return ctx.json({
      status: 'ok',
      version: '2.0.0',
      uptime: process.uptime(),
      queue_depth: queue.size(),
    });
  });

  // Store queue, subprocess, sessionManager, config in context for routes
  app.use(async (ctx, next) => {
    (ctx as any).queue = queue;
    (ctx as any).subprocess = subprocess;
    (ctx as any).sessionManager = sessionManager;
    (ctx as any).config = config;
    await next();
  });

  return app;
}
