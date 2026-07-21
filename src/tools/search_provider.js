const loadConfig = () => {
  try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
};

require('../providers/search/tavily');
require('../providers/search/duckduckgo');
require('../providers/search/searxng');
require('../providers/search/exa');

const name = 'search_provider';
const description = 'Unified search backend with pluggable providers. search/status/switch/list. Supports Tavily, DuckDuckGo, SearXNG, Exa. Switch via NATURECO_SEARCH_PROVIDER env or config.searchProvider. Default: tavily (falls back to others if no API key).';
const inputSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['search', 'status', 'list', 'switch'],
      description: 'Operation: search, status, list, or switch',
    },
    query: { type: 'string', description: '(search) Search query' },
    maxResults: { type: 'number', description: '(search) Max results (default: 5)' },
    provider: { type: 'string', description: '(search/switch) Provider name to use or switch to' },
  },
  required: ['action'],
};

async function execute(params) {
  const cfg = loadConfig();
  const { getActiveProvider, getProviderNames, resolveProviderConfig, getProvider } = require('../utils/search-provider');

  switch (params.action) {
    case 'search': {
      if (!params.query) return { success: false, error: 'query gerekli' };
      const providerName = params.provider || process.env.NATURECO_SEARCH_PROVIDER || cfg.searchProvider;
      let Provider;
      if (providerName) Provider = getProvider(providerName);
      if (!Provider) Provider = getActiveProvider(cfg);
      const provider = new Provider(cfg);
      return provider.search(params.query, { maxResults: params.maxResults || 5 });
    }

    case 'status': {
      const active = resolveProviderConfig(cfg);
      const avail = getProviderNames().sort();
      return {
        active,
        available: avail,
        config: cfg.searchProvider || '(not set, using default)',
        env: process.env.NATURECO_SEARCH_PROVIDER || '(not set)',
        default: 'tavily',
      };
    }

    case 'list': {
      const avail = getProviderNames().sort();
      return {
        success: true,
        providers: avail.map(name => {
          const Provider = getProvider(name);
          const inst = new Provider(cfg);
          const hasKey = name === 'duckduckgo' || name === 'searxng' || !!(cfg[name + 'ApiKey'] || process.env[name.toUpperCase() + '_API_KEY']);
          return { name, available: hasKey };
        }),
      };
    }

    case 'switch': {
      if (!params.provider) return { success: false, error: 'provider (name) gerekli' };
      const { setConfigValue } = require('../utils/config');
      setConfigValue('searchProvider', params.provider);
      return { success: true, message: `Search provider switched to: ${params.provider}` };
    }

    default:
      return { success: false, error: `Unknown action: ${params.action}` };
  }
}

module.exports = { name, description, inputSchema, execute };
