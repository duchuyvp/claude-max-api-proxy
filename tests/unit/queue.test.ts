import { expect, test } from 'bun:test';
import { RequestQueue } from '../../src/queue';

test('queue enqueues requests', async () => {
  const q = new RequestQueue();
  const results: string[] = [];

  q.setProcessor(async (req) => {
    results.push(req.id);
    req.resolve(`processed-${req.id}`);
  });

  const p1 = q.enqueue('anthropic', { test: 1 });
  const p2 = q.enqueue('openai', { test: 2 });

  const r1 = await p1;
  const r2 = await p2;

  expect(results).toHaveLength(2);
  expect(r1).toMatch(/^processed-/);
  expect(r2).toMatch(/^processed-/);
});

test('queue processes requests sequentially', async () => {
  const q = new RequestQueue();
  const order: number[] = [];

  q.setProcessor(async (req) => {
    order.push((req.data as any).num);
    // Simulate async work
    await new Promise((r) => setTimeout(r, 10));
    req.resolve(`done-${(req.data as any).num}`);
  });

  const p1 = q.enqueue('anthropic', { num: 1 });
  const p2 = q.enqueue('anthropic', { num: 2 });
  const p3 = q.enqueue('anthropic', { num: 3 });

  await Promise.all([p1, p2, p3]);

  expect(order).toEqual([1, 2, 3]);
});

test('queue rejects on processor error', async () => {
  const q = new RequestQueue();

  q.setProcessor(async (req) => {
    req.reject(new Error('test error'));
  });

  try {
    await q.enqueue('anthropic', {});
    expect(false).toBe(true); // should not reach
  } catch (e) {
    expect((e as Error).message).toBe('test error');
  }
});

test('queue size reflects pending requests', async () => {
  const q = new RequestQueue();
  let processing = false;

  q.setProcessor(async (req) => {
    processing = true;
    await new Promise((r) => setTimeout(r, 20));
    req.resolve(`done`);
    processing = false;
  });

  q.enqueue('anthropic', {});
  q.enqueue('anthropic', {});
  q.enqueue('anthropic', {});

  // First one is processing, two are queued
  expect(q.size()).toBeLessThanOrEqual(2);
});
