import { Config } from './types';
import * as fs from 'fs';
import * as path from 'path';

export function loadConfig(): Config {
  const configPath = process.env.CLAUDE_PROXY_CONFIG
    ? process.env.CLAUDE_PROXY_CONFIG
    : path.join(process.cwd(), 'config', 'claude-proxy.config.json');

  let config: Config = {
    models: {
      opus: 'claude-opus-4-6',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
      'claude-opus-4-6': 'claude-opus-4-6',
      'claude-sonnet-4-6': 'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
      'gpt-4': 'claude-opus-4-6',
      'gpt-4-turbo': 'claude-sonnet-4-6',
    },
    defaultModel: 'claude-opus-4-6',
    port: 3456,
    host: '127.0.0.1',
    requestTimeoutMs: 300000,
    logLevel: 'info',
  };

  // Load from file if exists
  if (fs.existsSync(configPath)) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config = { ...config, ...fileConfig };
  }

  // Override from environment
  if (process.env.CLAUDE_PROXY_PORT) {
    config.port = parseInt(process.env.CLAUDE_PROXY_PORT, 10);
  }
  if (process.env.CLAUDE_PROXY_HOST) {
    config.host = process.env.CLAUDE_PROXY_HOST;
  }
  if (process.env.CLAUDE_PROXY_DEFAULT_MODEL) {
    config.defaultModel = process.env.CLAUDE_PROXY_DEFAULT_MODEL;
  }
  if (process.env.CLAUDE_PROXY_TIMEOUT) {
    config.requestTimeoutMs = parseInt(
      process.env.CLAUDE_PROXY_TIMEOUT,
      10
    );
  }

  return config;
}

export function resolveModel(
  modelInput: string | undefined,
  config: Config
): string {
  if (!modelInput) {
    return config.defaultModel;
  }

  // Check if exact match in models map
  if (config.models[modelInput]) {
    return config.models[modelInput];
  }

  // If it looks like a full model name (contains 'claude-'), use it directly
  if (modelInput.includes('claude-')) {
    return modelInput;
  }

  // Default
  return config.defaultModel;
}
