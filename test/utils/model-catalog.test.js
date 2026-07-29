import { afterEach, describe, expect, it, vi } from 'vitest';

const catalog = require('../../src/utils/model-catalog');
const modelsCommand = require('../../src/commands/models');

afterEach(() => vi.unstubAllGlobals());

describe('shared model catalog', () => {
  it('contains current flagship families for every setup provider', () => {
    const presets = catalog.getSetupPresets((tr) => tr);
    expect(Object.keys(presets).length).toBeGreaterThanOrEqual(18);
    expect(presets.openai.models.map(m => m.id)).toContain('gpt-5.6-sol');
    expect(presets.anthropic.models.map(m => m.id)).toContain('claude-fable-5');
    expect(presets.gemini.models.map(m => m.id)).toContain('gemini-3.6-flash');
    expect(presets.minimax.models.map(m => m.id)).toContain('MiniMax-M2.7');
    expect(presets.xai.models.map(m => m.id)).toContain('grok-4.5');
    expect(presets.together.models.map(m => m.id)).toContain('MiniMaxAI/MiniMax-M3');
    expect(presets.kimi.default).toBe('kimi-k3');
    expect(presets.kimi.models.map(m => m.id)).toEqual(expect.arrayContaining(['kimi-k3', 'kimi-k2.5']));
    expect(presets.glm.models.map(m => m.id)).toContain('glm-5.1');
  });

  it('keeps the exact current OpenAI and Anthropic API IDs', () => {
    expect(catalog.getProviderModels('openai').map(m => m.id)).toEqual(expect.arrayContaining([
      'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
    ]));
    expect(catalog.getProviderModels('anthropic').map(m => m.id)).toEqual(expect.arrayContaining([
      'claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5',
    ]));
  });

  it('does not mistake every /v1-compatible URL for OpenAI', () => {
    expect(modelsCommand.getKnownModels('https://example.invalid/v1')).toEqual([]);
    expect(modelsCommand.getKnownModels('https://api.minimax.io/v1')[0].id).toBe('MiniMax-M2.7');
  });

  it('maps each live catalog endpoint correctly', () => {
    expect(modelsCommand.findModelsEndpoint('https://api.groq.com/openai/v1')).toBe('https://api.groq.com/openai/v1/models');
    expect(modelsCommand.findModelsEndpoint('https://generativelanguage.googleapis.com/v1beta')).toContain('/v1beta/models');
    expect(modelsCommand.findModelsEndpoint('http://localhost:11434/v1')).toBe('http://localhost:11434/api/tags');
    expect(modelsCommand.findModelsEndpoint('https://api.minimax.io')).toBe('https://api.minimax.io/v1/models');
    expect(modelsCommand.findModelsEndpoint('https://api.moonshot.ai/v1')).toBe('https://api.moonshot.ai/v1/models');
    expect(modelsCommand.findModelsEndpoint('https://api.z.ai/api/paas/v4')).toBe('https://api.z.ai/api/paas/v4/models');
  });

  it('parses Gemini live models and sends its API key as a query parameter', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [
        { name: 'models/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
      ] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await modelsCommand.fetchLiveModels(
      'https://generativelanguage.googleapis.com/v1beta/models', 'secret key', { timeout: 1000 }
    );
    expect(result.map(m => m.id)).toEqual(['gemini-3.6-flash']);
    expect(fetchMock.mock.calls[0][0]).toContain('key=secret%20key');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('uses live models first, keeps the active model, and filters non-chat models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [
        { id: 'new-chat-model' }, { id: 'whisper-audio-model' },
      ] }),
    })));
    const result = await modelsCommand.discoverProviderModels({
      providerUrl: 'https://api.openai.com/v1', providerApiKey: 'key', providerModel: 'current-model',
    });
    expect(result.source).toBe('live');
    expect(result.models.map(m => m.id).slice(0, 2)).toEqual(['current-model', 'new-chat-model']);
    expect(result.models.some(m => m.id.includes('whisper'))).toBe(false);
  });

  it('resolves numbers, exact IDs, custom IDs, and cancellation', () => {
    const available = [{ id: 'one' }, { id: 'two' }];
    expect(modelsCommand.resolveModelSelection('2', available).id).toBe('two');
    expect(modelsCommand.resolveModelSelection('one', available).id).toBe('one');
    expect(modelsCommand.resolveModelSelection('custom-latest', available).id).toBe('custom-latest');
    expect(modelsCommand.resolveModelSelection('', available)).toBeNull();
    expect(modelsCommand.resolveModelSelection('9', available)).toBeNull();
  });
});
