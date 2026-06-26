const { getConfig } = require('../utils/config');
const { getActiveProvider, getProviderNames, DEFAULT_PROVIDER } = require('../utils/search-provider');
require('../providers/search/tavily');
require('../providers/search/duckduckgo');
require('../providers/search/searxng');
require('../providers/search/exa');

module.exports = {
  name: 'web_search',
  description: 'Search the web for current information using the configured search provider (Tavily, DuckDuckGo, SearXNG, Exa). Switch via NATURECO_SEARCH_PROVIDER env or config.searchProvider.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5)' },
      provider: { type: 'string', description: 'Override provider: tavily, duckduckgo, searxng, exa (default: configured or tavily)' },
    },
    required: ['query']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const providerName = params.provider || process.env.NATURECO_SEARCH_PROVIDER || config.searchProvider;
      let Provider;

      if (providerName) {
        const { getProvider } = require('../utils/search-provider');
        Provider = getProvider(providerName);
      }
      if (!Provider) {
        Provider = getActiveProvider(config);
      }

      const provider = new Provider(config);
      const result = await provider.search(params.query, {
        maxResults: params.maxResults || 5,
      });

      if (!result.success && providerName && !params.provider) {
        const allProviders = getProviderNames();
        for (const name of allProviders) {
          if (name === providerName) continue;
          const { getProvider } = require('../utils/search-provider');
          const FallbackProvider = getProvider(name);
          if (!FallbackProvider) continue;
          const fallback = new FallbackProvider(config);
          const fallbackResult = await fallback.search(params.query, { maxResults: params.maxResults || 5 });
          if (fallbackResult.success) {
            fallbackResult.fallback = true;
            fallbackResult.fallbackReason = result.error;
            return fallbackResult;
          }
        }
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
