const { ChannelAdapter, ChannelDeliveryManager, ReconnectSupervisor, deliveryId } = require('../../src/utils/channel-sdk');

describe('channel adapter SDK', () => {
  test('connects lazily and reports health', async () => {
    let connections = 0;
    const adapter = new ChannelAdapter({ name: 'test', connect: async () => { connections++; }, send: async item => item.payload });
    await expect(adapter.send({ payload: 'hello' })).resolves.toBe('hello');
    expect(connections).toBe(1);
    await expect(adapter.health()).resolves.toMatchObject({ channel: 'test', state: 'connected', ok: true });
  });

  test('deduplicates delivery and retries transient failures', async () => {
    let calls = 0;
    const manager = new ChannelDeliveryManager({ maxAttempts: 3, baseDelayMs: 0, sleep: async () => {} });
    manager.register(new ChannelAdapter({ name: 'test', send: async () => { calls++; if (calls < 2) throw new Error('temporary'); return { messageId: 'm1' }; } }));
    const first = manager.enqueue('test', 'user', { text: 'hello' }, { idempotencyKey: 'same' });
    const duplicate = manager.enqueue('test', 'user', { text: 'hello' }, { idempotencyKey: 'same' });
    expect(duplicate.duplicate).toBe(true);
    const [result] = await manager.drain();
    expect(result).toMatchObject({ ok: true, id: first.id, attempts: 2 });
    expect(manager.snapshotMetrics()).toMatchObject({ delivered: 1, retried: 1, deduplicated: 1, queueDepth: 0 });
  });

  test('fails after bounded attempts and keeps per-channel metrics', async () => {
    const manager = new ChannelDeliveryManager({ maxAttempts: 2, baseDelayMs: 0, sleep: async () => {} });
    manager.register(new ChannelAdapter({ name: 'bad', send: async () => { throw new Error('offline'); } }));
    manager.enqueue('bad', 'user', 'x');
    const [result] = await manager.drain();
    expect(result).toMatchObject({ ok: false, attempts: 2, error: 'offline' });
    expect(manager.snapshotMetrics().byChannel.bad).toMatchObject({ failed: 1, retried: 1 });
  });

  test('derives stable delivery ids', () => {
    expect(deliveryId('sms', '1', { text: 'x' })).toBe(deliveryId('sms', '1', { text: 'x' }));
    expect(deliveryId('sms', '1', { text: 'x' }, 'explicit')).toBe('explicit');
  });
});

describe('channel reconnect supervisor', () => {
  test('retries with backoff and reconnects without duplicate jobs', async () => {
    let calls = 0;
    const delays = [];
    const adapter = new ChannelAdapter({ name: 'telegram', connect: async () => { calls++; if (calls < 3) throw new Error('offline'); } });
    const supervisor = new ReconnectSupervisor({ maxAttempts: 4, baseDelayMs: 100, jitter: 0, sleep: async ms => delays.push(ms) });
    const first = supervisor.reconnect(adapter);
    const second = supervisor.reconnect(adapter);
    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ ok: true, attempts: 3 });
    expect(delays).toEqual([100, 200]);
    expect(supervisor.snapshotMetrics()).toMatchObject({ attempts: 3, reconnected: 1, active: 0 });
  });

  test('stops after bounded attempts', async () => {
    const adapter = new ChannelAdapter({ name: 'offline', connect: async () => { throw new Error('offline'); } });
    const supervisor = new ReconnectSupervisor({ maxAttempts: 2, baseDelayMs: 0, sleep: async () => {} });
    await expect(supervisor.reconnect(adapter)).resolves.toMatchObject({ ok: false, stopped: 'exhausted', attempts: 2 });
    expect(supervisor.snapshotMetrics().exhausted).toBe(1);
  });
});
