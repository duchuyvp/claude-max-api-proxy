import { expect, test } from 'bun:test';
import { loadConfig, resolveModel } from '../../src/config';

test('loadConfig returns default config', () => {
  const config = loadConfig();
  expect(config.port).toBe(3456);
  expect(config.host).toBe('127.0.0.1');
  expect(config.defaultModel).toBe('claude-opus-4-6');
});

test('resolveModel maps aliases to full names', () => {
  const config = loadConfig();
  expect(resolveModel('opus', config)).toBe('claude-opus-4-6');
  expect(resolveModel('sonnet', config)).toBe('claude-sonnet-4-6');
  expect(resolveModel('haiku', config)).toBe('claude-haiku-4-5-20251001');
});

test('resolveModel handles full model names', () => {
  const config = loadConfig();
  expect(resolveModel('claude-opus-4-6', config)).toBe('claude-opus-4-6');
});

test('resolveModel defaults to default model on unknown input', () => {
  const config = loadConfig();
  expect(resolveModel('unknown-model', config)).toBe('claude-opus-4-6');
  expect(resolveModel(undefined, config)).toBe('claude-opus-4-6');
});
