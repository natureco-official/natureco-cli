import { describe, test, expect } from 'vitest';
import gatewayServer from '../../src/commands/gateway-server.js';

describe('gateway health snapshot', () => {
  test('reports configured channels and secret-free delivery metrics', async () => {
    const manager = {
      health: async () => [{ channel: 'telegram', state: 'connected', ok: true }],
      snapshotMetrics: () => ({ enqueued: 3, delivered: 2, failed: 0, retried: 1, deduplicated: 0, byChannel: {}, queueDepth: 1, inFlight: 0 }),
      deadLetters: [],
    };
    const health = await gatewayServer.buildGatewayHealth({ telegramToken: 'must-not-leak', providerApiKey: 'secret' }, manager);
    expect(health).toMatchObject({ ok: true, status: 'healthy', channels: { telegram: { state: 'connected' } }, delivery: { queueDepth: 1, deadLetters: 0 } });
    expect(JSON.stringify(health)).not.toContain('must-not-leak');
    expect(JSON.stringify(health)).not.toContain('secret');
  });

  test('marks failures as degraded', async () => {
    const manager = { health: async () => [], snapshotMetrics: () => ({ failed: 1, delivered: 0, queueDepth: 0, inFlight: 0 }), deadLetters: [{}] };
    await expect(gatewayServer.buildGatewayHealth({}, manager)).resolves.toMatchObject({ ok: false, status: 'degraded', delivery: { deadLetters: 1 } });
  });
});
