#!/usr/bin/env node

import { createServer } from './server';
import { loadConfig } from './config';
import { RequestQueue } from './queue';
import { CLISubprocess } from './cli/subprocess';
import { SessionManager } from './cli/session';
import { createAnthropicRoutes } from './routes/anthropic';
import { createOpenAIRoutes } from './routes/openai';
import { createSharedRoutes } from './routes/shared';
import { execSync } from 'child_process';

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
  app.route('/', createSharedRoutes());

  // 404 handler
  app.notFound((ctx) => {
    return ctx.json(
      { error: 'Not found', status: 404 },
      { status: 404 }
    );
  });

  // Start server
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: app.fetch,
  });

  console.log(`\n✅ Server running at http://${config.host}:${config.port}`);
  console.log(`📚 API Documentation:`);
  console.log(`   Anthropic: POST http://${config.host}:${config.port}/v1/messages`);
  console.log(`   OpenAI: POST http://${config.host}:${config.port}/v1/chat/completions`);
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
