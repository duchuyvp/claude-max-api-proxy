import { expect, test } from 'bun:test';
import { SessionManager } from '../../src/cli/session';
import { StreamParser } from '../../src/cli/stream-parser';

test('SessionManager generates unique session IDs for each request', () => {
  const sm = new SessionManager();
  const key1 = sm.getSessionKey('user1');
  const key2 = sm.getSessionKey('user1');
  // Each request gets a unique session ID (Claude CLI doesn't allow session reuse)
  expect(key1).not.toBe(key2);
});

test('SessionManager returns UUID format', () => {
  const sm = new SessionManager();
  const key = sm.getSessionKey('user1');
  // Should be a valid UUID v4 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  expect(uuidRegex.test(key)).toBe(true);
});

test('StreamParser parses newline-delimited JSON', () => {
  const events: any[] = [];
  const parser = new StreamParser((event) => {
    events.push(event);
  });

  const input = `{"type":"message_start","id":"1"}\n{"type":"content_block_delta","text":"hello"}\n`;
  parser.processChunk(input);

  expect(events).toHaveLength(2);
  expect(events[0].type).toBe('message_start');
  expect(events[1].type).toBe('content_block_delta');
});

test('StreamParser handles incomplete JSON', () => {
  const events: any[] = [];
  const parser = new StreamParser((event) => {
    events.push(event);
  });

  const part1 = '{"type":"message_start",';
  const part2 = '"id":"1"}\n';

  parser.processChunk(part1);
  expect(events).toHaveLength(0); // incomplete

  parser.processChunk(part2);
  expect(events).toHaveLength(1); // now complete
});
