#!/usr/bin/env node

import { createServer } from './server';
import { loadConfig } from './config';
import { RequestQueue } from './queue';
import { CLISubprocess } from './cli/subprocess';
import { SessionManager } from './cli/session';
import { createAnthropicRoutes } from './routes/anthropic';
import { createOpenAIRoutes } from './routes/openai';
import { createSharedRoutes } from './routes/shared';
import { createEmbeddingsRoutes } from './routes/embeddings';
import { execSync } from 'child_process';
import * as http from 'http';

// Convert Node.js request to Fetch API Request
async function nodeRequestToFetchRequest(
  req: http.IncomingMessage,
  host: string
): Promise<Request> {
  const url = new URL(req.url || '/', `http://${host}`);
  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? Buffer.concat(await collectRequestBody(req))
      : undefined;

  return new Request(url.toString(), {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: body?.length ? body : undefined,
  });
}

function collectRequestBody(req: http.IncomingMessage): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

async function main() {
  // Load config
  const config = loadConfig();

  console.log('🚀 claude-max-api-proxy v2.0.0');
  console.log(`📦 Default model: ${config.defaultModel}`);
  console.log(`🔧 Available models: ${Object.keys(config.models).join(', ')}`);

  // Verify Claude CLI is installed
  try {
    execSync('claude --version', { stdio: 'ignore' });
    console.log('✓ Claude Code CLI found');
  } catch {
    console.error(
      '✗ Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code'
    );
    process.exit(1);
  }

  // Initialize components
  const queue = new RequestQueue();
  const sessionManager = new SessionManager();
  const subprocess = new CLISubprocess(config, sessionManager);

  // Create server
  const app = createServer(config, queue, subprocess, sessionManager);

  // Register routes
  app.route('/', createAnthropicRoutes());
  app.route('/', createOpenAIRoutes());
  app.route('/', createEmbeddingsRoutes());
  app.route('/', createSharedRoutes());

  // 404 handler
  app.notFound((ctx) => {
    return ctx.json(
      { error: 'Not found', status: 404 },
      { status: 404 }
    );
  });

  // Start server (support both Bun and Node.js)
  if (typeof Bun !== 'undefined') {
    // Running in Bun
    const server = Bun.serve({
      port: config.port,
      hostname: config.host,
      fetch: app.fetch,
    });
    console.log(`\n✅ Server running (Bun) at http://${config.host}:${config.port}`);
  } else {
    // Running in Node.js
    const server = http.createServer(async (req, res) => {
      try {
        const fetchRequest = await nodeRequestToFetchRequest(
          req,
          `${config.host}:${config.port}`
        );
        const response = await app.fetch(fetchRequest);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    server.listen(config.port, config.host, () => {
      console.log(`\n✅ Server running (Node.js) at http://${config.host}:${config.port}`);
    });
  }

  console.log(`📚 API Documentation:`);
  console.log(`   Anthropic Messages: POST http://${config.host}:${config.port}/v1/messages`);
  console.log(`   Anthropic Embeddings: POST http://${config.host}:${config.port}/v1/embed`);
  console.log(`   OpenAI Chat: POST http://${config.host}:${config.port}/v1/chat/completions`);
  console.log(`   OpenAI Embeddings: POST http://${config.host}:${config.port}/v1/embeddings`);
  console.log(`   Models: GET http://${config.host}:${config.port}/v1/models`);
  console.log(`   Health: GET http://${config.host}:${config.port}/health`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    queue.clear();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    queue.clear();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
