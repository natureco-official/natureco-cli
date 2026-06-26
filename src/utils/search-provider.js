const PROVIDER_CONFIG_KEY = 'searchProvider';
const DEFAULT_PROVIDER = 'tavily';

const _registry = new Map();

function registerProvider(name, providerClass) {
  _registry.set(name, providerClass);
}

function getProviderNames() {
  return Array.from(_registry.keys());
}

function getProvider(name) {
  return _registry.get(name) || null;
}

function resolveProviderConfig(cfg) {
  const env = process.env.NATURECO_SEARCH_PROVIDER || '';
  if (env && _registry.has(env)) return env;
  if (cfg && cfg[PROVIDER_CONFIG_KEY] && _registry.has(cfg[PROVIDER_CONFIG_KEY])) {
    return cfg[PROVIDER_CONFIG_KEY];
  }
  return DEFAULT_PROVIDER;
}

function getActiveProvider(cfg) {
  const name = resolveProviderConfig(cfg);
  const Cls = getProvider(name);
  if (!Cls) return getProvider(DEFAULT_PROVIDER);
  return Cls;
}

class SearchProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  async search(query, options = {}) {
    throw new Error('Not implemented: search');
  }

  normalizeResults(rawResults) {
    return (rawResults || []).map(r => ({
      title: r.title || '',
      snippet: r.snippet || r.content || r.text || '',
      url: r.url || '',
    }));
  }
}

module.exports = {
  SearchProvider,
  registerProvider,
  getProviderNames,
  getProvider,
  resolveProviderConfig,
  getActiveProvider,
  PROVIDER_CONFIG_KEY,
  DEFAULT_PROVIDER,
};
