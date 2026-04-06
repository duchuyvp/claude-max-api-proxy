import { expect, test } from 'bun:test';
import { anthropicToCli } from '../../src/adapters/anthropic-to-cli';
import { openaiToCli } from '../../src/adapters/openai-to-cli';

test('anthropicToCli extracts system message', () => {
  const req = {
    system: 'You are helpful',
    messages: [{ role: 'user', content: 'Hello' }],
  };
  const result = anthropicToCli(req as any);
  expect(result.systemMessage).toBe('You are helpful');
});

test('anthropicToCli preserves parameters', () => {
  const req = {
    system: 'Help',
    messages: [{ role: 'user', content: 'Hi' }],
    temperature: 0.5,
    max_tokens: 100,
    top_p: 0.9,
  };
  const result = anthropicToCli(req as any);
  expect(result.temperature).toBe(0.5);
  expect(result.maxTokens).toBe(100);
  expect(result.topP).toBe(0.9);
});

test('openaiToCli converts OpenAI format', () => {
  const req = {
    messages: [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ],
  };
  const result = openaiToCli(req);
  expect(result.systemMessage).toBe('You are helpful');
  expect(result.prompt).toContain('Hello');
});
