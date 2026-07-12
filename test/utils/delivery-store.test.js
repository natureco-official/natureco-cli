import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DeliveryStore } from '../../src/utils/delivery-store.js';
import { ChannelAdapter, ChannelDeliveryManager } from '../../src/utils/channel-sdk.js';

const dirs = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('persistent delivery queue', () => {
  test('restores queued messages after process restart', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-queue-')); dirs.push(dir);
    const store = new DeliveryStore({ file: path.join(dir, 'queue.json') });
    const first = new ChannelDeliveryManager({ store });
    first.enqueue('sms', 'user', { text: 'hello' }, { idempotencyKey: 'm1' });
    const second = new ChannelDeliveryManager({ store });
    expect(second.queue).toHaveLength(1);
    expect(second.queue[0]).toMatchObject({ id: 'm1', channel: 'sms', target: 'user' });
    expect(fs.readFileSync(store.file, 'utf8')).toContain('"version": 1');
  });

  test('moves exhausted deliveries to dead letter and can requeue', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-queue-')); dirs.push(dir);
    const store = new DeliveryStore({ file: path.join(dir, 'queue.json') });
    const manager = new ChannelDeliveryManager({ store, maxAttempts: 1, baseDelayMs: 0 });
    manager.register(new ChannelAdapter({ name: 'sms', send: async () => { throw new Error('offline'); } }));
    manager.enqueue('sms', 'user', 'hello', { idempotencyKey: 'm1' });
    await manager.drain();
    expect(manager.deadLetters).toHaveLength(1);
    expect(manager.requeueDeadLetter('m1')).toEqual({ ok: true, id: 'm1' });
    expect(manager.queue).toHaveLength(1);
    expect(new DeliveryStore({ file: store.file }).load().queue).toHaveLength(1);
  });

  test('corrupt files fall back to an empty safe state', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-queue-')); dirs.push(dir);
    const file = path.join(dir, 'queue.json'); fs.writeFileSync(file, '{broken');
    expect(new DeliveryStore({ file }).load()).toEqual({ version: 1, queue: [], deadLetters: [] });
  });
});
