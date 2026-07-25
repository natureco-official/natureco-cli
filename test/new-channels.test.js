import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const requireCjs = createRequire(import.meta.url);
const { ownedKeys, configKey, botIdKey, maskSecret } = requireCjs('../src/utils/channel-setup.js');
const runtime = requireCjs('../src/utils/channel-runtime.js');

const DESCRIPTORS = {
  matrix: requireCjs('../src/commands/matrix.js').descriptor,
  teams: requireCjs('../src/commands/teams.js').descriptor,
  googlechat: requireCjs('../src/commands/googlechat.js').descriptor,
  zalo: requireCjs('../src/commands/zalo.js').descriptor,
};

/**
 * These four channels cannot be verified against a live service without
 * accounts and tokens. Everything that does NOT need credentials is covered
 * here: descriptor shape, config key ownership, secret masking, webhook payload
 * routing, sender gating, and the failure paths of each probe.
 */
describe('new channel descriptors are well formed', () => {
  for (const [name, d] of Object.entries(DESCRIPTORS)) {
    it(`${name}: has the fields the setup layer requires`, () => {
      expect(d.id).toBe(name);
      expect(typeof d.label).toBe('string');
      expect(typeof d.probe).toBe('function');
      expect(Array.isArray(d.fields)).toBe(true);
      expect(d.fields.length).toBeGreaterThan(0);
      for (const field of d.fields) {
        expect(typeof field.key).toBe('string');
        expect(typeof field.message).toBe('function');
        expect(field.message().length).toBeGreaterThan(0);
      }
      expect(d.instructions().length).toBeGreaterThan(0);
    });

    it(`${name}: declares how inbound messages arrive`, () => {
      expect(['webhook', 'poll']).toContain(d.inbound);
      if (d.inbound === 'webhook') expect(d.webhookPath).toMatch(/^\/webhooks\//);
    });

    it(`${name}: at least one credential field is required`, () => {
      // googlechat is the exception: either of its two credentials will do, so
      // the requirement is enforced in its probe instead.
      if (name === 'googlechat') return;
      expect(d.fields.some(f => f.required)).toBe(true);
    });
  }

  it('claims a disjoint set of config keys per channel', () => {
    const seen = new Map();
    for (const [name, d] of Object.entries(DESCRIPTORS)) {
      for (const key of ownedKeys(d)) {
        expect(seen.has(key), `${key} claimed by both ${seen.get(key)} and ${name}`).toBe(false);
        seen.set(key, name);
      }
    }
  });

  it('builds config keys the gateway already reads', () => {
    expect(configKey('matrix', 'homeserver')).toBe('matrixHomeserver');
    expect(configKey('googlechat', 'keyFile')).toBe('googlechatKeyFile');
    expect(botIdKey('zalo')).toBe('zaloBotId');
  });
});

describe('maskSecret never reveals a whole token', () => {
  it('masks a long token to its ends', () => {
    expect(maskSecret('syt_verylongsecrettoken_1234')).toBe('syt****234');
  });

  it('fully masks a short value rather than showing most of it', () => {
    expect(maskSecret('abc')).toBe('****');
    expect(maskSecret('')).toBe('****');
    expect(maskSecret(undefined)).toBe('****');
  });
});

describe('probe failure paths report clearly without credentials', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('matrix: a 401 is reported as an invalid token, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })));
    const result = await DESCRIPTORS.matrix.probe({ homeserver: 'https://example.org', token: 'bad' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
    expect(result.hint).toMatch(/invalid|geçersiz/i);
  });

  it('matrix: a bot in zero rooms succeeds but says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      String(url).includes('joined_rooms')
        ? { ok: true, json: async () => ({ joined_rooms: [] }) }
        : { ok: true, json: async () => ({ user_id: '@bot:example.org', device_id: 'DEV' }) }
    )));
    const result = await DESCRIPTORS.matrix.probe({ homeserver: 'https://example.org', token: 'ok' });
    expect(result.ok).toBe(true);
    expect(result.hint).toMatch(/no rooms|hiçbir odada/i);
  });

  it('googlechat: refuses when neither credential is provided', async () => {
    const result = await DESCRIPTORS.googlechat.probe({ webhookUrl: '', keyFile: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Neither|Ne webhook/i);
  });

  it('googlechat: rejects a webhook URL from the wrong host', async () => {
    const result = await DESCRIPTORS.googlechat.probe({ webhookUrl: 'https://evil.example/hook', keyFile: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/chat\.googleapis\.com/);
  });

  it('googlechat: reports a missing key file by path', async () => {
    const missing = path.join(os.tmpdir(), 'nc-no-such-key.json');
    const result = await DESCRIPTORS.googlechat.probe({ webhookUrl: '', keyFile: missing });
    expect(result.ok).toBe(false);
    expect(result.error).toContain(missing);
  });

  it('zalo: surfaces an error code returned inside a 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ error: -216, message: 'access token is invalid' }),
    })));
    const result = await DESCRIPTORS.zalo.probe({ accessToken: 'stale' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('-216');
    expect(result.hint).toMatch(/expired|süresi dolmuş/i);
  });

  it('zalo: a healthy OA reports its identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ error: 0, data: { name: 'Test OA', oa_id: '123', num_follower: 7 } }),
    })));
    const result = await DESCRIPTORS.zalo.probe({ accessToken: 'good' });
    expect(result.ok).toBe(true);
    expect(result.lines.flat()).toContain('Test OA');
  });

  it('teams: a rejected client secret is reported as such', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 401,
      text: async () => JSON.stringify({ error_description: 'AADSTS7000215: invalid client secret' }),
    })));
    const result = await DESCRIPTORS.teams.probe({ appId: 'app', appPassword: 'wrong', tenantId: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid client secret');
  });
});

describe('inbound routing applies the sender gate', () => {
  beforeEach(() => {
    runtime.configure({ log: () => {}, channelGate: () => ({ allowed: true, trusted: true }) });
  });

  it('drops empty text without calling the brain', async () => {
    const reply = await runtime.routeInbound({ channel: 'matrix', chatKey: '!r', senderId: '@u', text: '   ', config: {} });
    expect(reply).toBe('');
  });

  it('drops a blocked sender', async () => {
    runtime.configure({ log: () => {}, channelGate: () => ({ allowed: false, reason: 'pairing-required' }) });
    const reply = await runtime.routeInbound({ channel: 'zalo', chatKey: '1', senderId: '1', text: 'hello', config: {} });
    expect(reply).toBe('');
  });
});

describe('webhook handlers ignore non-message events', () => {
  beforeEach(() => {
    runtime.configure({ log: () => {}, channelGate: () => ({ allowed: true, trusted: true }) });
  });

  it('teams: ignores a non-message activity', async () => {
    const result = await runtime.handleTeamsWebhook({}, { type: 'conversationUpdate' });
    expect(result.status).toBe(200);
  });

  it('teams: rejects a message with no conversation or serviceUrl', async () => {
    const result = await runtime.handleTeamsWebhook({}, { type: 'message', text: 'hi' });
    expect(result.status).toBe(400);
  });

  it('googlechat: ignores ADDED_TO_SPACE', async () => {
    const result = await runtime.handleGoogleChatWebhook({}, { type: 'ADDED_TO_SPACE' });
    expect(result.status).toBe(200);
  });

  it('googlechat: ignores a message from another bot', async () => {
    const result = await runtime.handleGoogleChatWebhook({}, {
      type: 'MESSAGE', space: { name: 'spaces/AAA' },
      message: { text: 'hi', sender: { type: 'BOT' } },
    });
    expect(result.status).toBe(200);
    expect(result.body.text).toBeUndefined();
  });

  it('zalo: ignores events that are not user messages', async () => {
    const result = await runtime.handleZaloWebhook({}, { event_name: 'follow', sender: { id: '1' } });
    expect(result.status).toBe(200);
  });

  it('all three reject an empty payload rather than throwing', async () => {
    expect((await runtime.handleTeamsWebhook({}, null)).status).toBe(200);
    expect((await runtime.handleGoogleChatWebhook({}, null)).status).toBe(400);
    expect((await runtime.handleZaloWebhook({}, null)).status).toBe(400);
  });
});

describe('outbound senders fail loudly when unconfigured', () => {
  it('teams: says the serviceUrl is unknown before the bot has been messaged', async () => {
    await expect(runtime.sendTeamsMessage({}, 'conv-never-seen', 'hi'))
      .rejects.toThrow(/serviceUrl/i);
  });

  it('googlechat: refuses with no key file and no webhook URL', async () => {
    await expect(runtime.sendGoogleChatMessage({}, 'spaces/AAA', 'hi'))
      .rejects.toThrow(/not configured|yapılandırılmamış/i);
  });
});

describe('gateway registration', () => {
  it('advertises all four channels as delivery adapters', async () => {
    const gateway = requireCjs('../src/commands/gateway-server.js');
    const { ChannelDeliveryManager } = requireCjs('../src/utils/channel-sdk.js');
    const { DeliveryStore } = requireCjs('../src/utils/delivery-store.js');
    const manager = new ChannelDeliveryManager({ store: new DeliveryStore() });
    gateway.registerGatewayDeliveryAdapters({}, manager);
    for (const name of ['matrix', 'teams', 'googlechat', 'zalo']) {
      expect(manager.adapters.has(name), `${name} adapter missing`).toBe(true);
    }
  });

  it('counts a configured new channel in gateway health', async () => {
    const gateway = requireCjs('../src/commands/gateway-server.js');
    const health = await gateway.buildGatewayHealth({ matrixBotId: 'matrix_1', matrixHomeserver: 'https://x' });
    expect(Object.keys(health.channels)).toContain('matrix');
  });
});

describe('CLI surface', () => {
  it('registers a command per new channel', () => {
    const src = fs.readFileSync(path.resolve('bin/natureco.js'), 'utf8');
    for (const name of ['matrix', 'teams', 'googlechat', 'zalo']) {
      expect(src).toContain(`'${name}'`);
    }
  });

  it('lists them in channels.js so `channels add` mentions them', () => {
    const src = fs.readFileSync(path.resolve('src/commands/channels.js'), 'utf8');
    for (const name of ['matrix', 'teams', 'googlechat', 'zalo']) {
      expect(src).toContain(`${name}BotId`);
    }
  });
});
