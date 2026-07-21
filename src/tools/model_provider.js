require('../providers/model/openai');
require('../providers/model/anthropic');
require('../providers/model/gemini');
require('../providers/model/minimax');
require('../providers/model/ollama');

const name = 'model_provider';
const description = 'Model provider management. status/switch/list — view or switch between model providers (openai, anthropic, gemini, minimax, ollama). Also supports model-specific queries.';
const inputSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['status', 'list', 'switch'],
      description: 'Operation: status, list, or switch',
    },
    provider: { type: 'string', description: '(switch) Provider name to switch to' },
    model: { type: 'string', description: '(switch) Model to use with provider' },
  },
  required: ['action'],
};

async function execute(params) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; } })();
  const { getProviderNames, getProvider, resolveProviderConfig, detectFamily } = require('../utils/model-provider');

  switch (params.action) {
    case 'status': {
      const active = resolveProviderConfig(cfg);
      const family = detectFamily(cfg.providerUrl, cfg.providerModel);
      const avail = getProviderNames().sort();
      return {
        activeProvider: active,
        detectedFamily: family,
        available: avail,
        url: (cfg.providerUrl || '').replace(/\/\/.*@/, '//***@'),
        model: cfg.providerModel || '(not set)',
        env: process.env.NATURECO_MODEL_PROVIDER || '(not set)',
        configValue: cfg.modelProvider || '(not set, using auto-detect)',
      };
    }

    case 'list': {
      const avail = getProviderNames().sort();
      return {
        success: true,
        providers: avail.map(name => {
          const Provider = getProvider(name);
          const inst = new Provider(cfg);
          return { name, endpoint: inst.getEndpoint() };
        }),
      };
    }

    case 'switch': {
      if (!params.provider) return { success: false, error: 'provider name gerekli' };
      const { setConfigValue } = require('../utils/config');
      setConfigValue('modelProvider', params.provider);
      if (params.model) setConfigValue('providerModel', params.model);
      return { success: true, message: `Model provider switched to: ${params.provider}${params.model ? ' (model: ' + params.model + ')' : ''}` };
    }

    default:
      return { success: false, error: `Unknown action: ${params.action}` };
  }
}

module.exports = { name, description, inputSchema, execute };
