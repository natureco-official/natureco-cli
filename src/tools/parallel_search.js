const { getConfig } = require('../utils/config');
const { getProviderNames, getProvider } = require('../utils/search-provider');
require('../providers/search/tavily');
require('../providers/search/duckduckgo');
require('../providers/search/searxng');
require('../providers/search/exa');

module.exports = {
  name: 'parallel_search',
  description: 'Run search across multiple search providers in parallel and merge results. Uses configured providers (DuckDuckGo, SearXNG, Exa, Tavily).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum results per provider (default: 3)' },
      providers: { type: 'array', items: { type: 'string' }, description: 'Providers to use (default: all available, except Tavily which needs API key)' },
    },
    required: ['query'],
  },

  async execute(params) {
    try {
      const config = getConfig();
      const query = params.query;
      const maxResults = params.maxResults || 3;
      const allProviders = getProviderNames();

      let providersToUse = params.providers || allProviders;
      providersToUse = providersToUse.filter(name => allProviders.includes(name));

      if (providersToUse.length === 0) {
        return { success: false, error: 'Kullanilabilir search provider bulunamadi' };
      }

      const results = await Promise.allSettled(
        providersToUse.map(async (name) => {
          const Provider = getProvider(name);
          if (!Provider) throw new Error(`Provider bulunamadi: ${name}`);
          const provider = new Provider(config);
          const result = await provider.search(query, { maxResults });
          return { provider: name, result };
        })
      );

      const merged = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.result.success) {
          for (const item of r.value.result.results || []) {
            merged.push({
              ...item,
              _provider: r.value.provider,
            });
          }
        }
      }

      return {
        success: true,
        query,
        results: merged.slice(0, maxResults * providersToUse.length),
        count: merged.length,
        providersUsed: providersToUse,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};