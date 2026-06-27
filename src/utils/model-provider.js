const _registry = new Map();
const _instances = new Map();

const PROVIDER_CONFIG_KEY = 'modelProvider';
const DEFAULT_PROVIDER = 'auto';

function registerProvider(name, providerClass) {
  _registry.set(name, providerClass);
}

function getProviderNames() {
  return Array.from(_registry.keys());
}

function getProvider(name) {
  return _registry.get(name) || null;
}

function detectFamily(providerUrl, model) {
  const url = (providerUrl || '').toLowerCase();
  const m = (model || '').toLowerCase();
  if (url.includes('anthropic.com') || m.includes('claude')) return 'anthropic';
  if (url.includes('groq.com') || m.includes('groq') || m.includes('llama-3') || m.includes('mixtral')) return 'groq';
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.deepseek.com') || m.includes('deepseek')) return 'deepseek';
  if (url.includes('mistral.ai') || m.includes('mistral') || m.includes('codestral')) return 'mistral';
  if (url.includes('together.xyz') || m.includes('together')) return 'together';
  if (url.includes('fireworks.ai') || m.includes('fireworks')) return 'fireworks';
  if (url.includes('perplexity.ai') || m.includes('pplx') || m.includes('sonar')) return 'perplexity';
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('ollama')) return 'ollama';
  if (url.includes('minimax.io') || url.includes('minimax')) return 'minimax';
  if (url.includes('generativelanguage.googleapis.com') || url.includes('gemini')) return 'gemini';
  return 'openai';
}

function getProviderFamily(name) {
  const openaiCompat = ['openai', 'groq', 'openrouter', 'deepseek', 'mistral', 'together', 'fireworks', 'perplexity'];
  if (openaiCompat.includes(name)) return 'openai';
  return name;
}

function resolveProviderConfig(cfg) {
  const env = process.env.NATURECO_MODEL_PROVIDER || '';
  if (env && _registry.has(env)) return env;
  if (cfg && cfg[PROVIDER_CONFIG_KEY] && _registry.has(cfg[PROVIDER_CONFIG_KEY])) {
    return cfg[PROVIDER_CONFIG_KEY];
  }
  const family = detectFamily(cfg?.providerUrl, cfg?.providerModel);
  const resolved = getProviderFamily(family);
  if (_registry.has(resolved)) return resolved;
  return DEFAULT_PROVIDER;
}

function getActiveProvider(cfg) {
  const name = resolveProviderConfig(cfg);
  if (name === 'auto') {
    const family = detectFamily(cfg?.providerUrl, cfg?.providerModel);
    const familyGroup = getProviderFamily(family);
    const Cls = _registry.get(familyGroup);
    if (Cls) return Cls;
  }
  const Cls = _registry.get(name);
  if (!Cls) return getProvider('openai') || null;
  return Cls;
}

const DEFAULT_ANTHROPIC_SYSTEM = 'You are a helpful AI assistant running inside the natureco CLI.';

class ModelProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  getEndpoint() {
    throw new Error('Not implemented: getEndpoint');
  }

  buildRequest(messages, options = {}) {
    throw new Error('Not implemented: buildRequest');
  }

  parseResponse(data) {
    throw new Error('Not implemented: parseResponse');
  }

  normalizeTools(tools) {
    return tools || [];
  }

  parseToolCalls(message) {
    return message?.tool_calls || [];
  }

  extractSystem(messages) {
    const systemMsg = messages.find(m => m.role === 'system');
    return systemMsg?.content || '';
  }
}

module.exports = {
  ModelProvider,
  registerProvider,
  getProviderNames,
  getProvider,
  detectFamily,
  getProviderFamily,
  resolveProviderConfig,
  getActiveProvider,
  PROVIDER_CONFIG_KEY,
  DEFAULT_PROVIDER,
  DEFAULT_ANTHROPIC_SYSTEM,
};
