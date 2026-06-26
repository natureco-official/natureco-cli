const { SearchProvider, registerProvider } = require('../../utils/search-provider');

class TavilyProvider extends SearchProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'tavily';
  }

  async search(query, options = {}) {
    const apiKey = this.config.tavilyApiKey || process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Tavily API key gerekli. Kur: natureco config set tavilyApiKey tvly_xxx', provider: this.name };
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options.searchDepth || 'basic',
        max_results: options.maxResults || 5,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Tavily API error: ${response.status}`, provider: this.name };
    }

    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error, provider: this.name };
    }

    const results = this.normalizeResults(data.results || []);
    return {
      success: true,
      query,
      results,
      count: results.length,
      provider: this.name,
    };
  }
}

registerProvider('tavily', TavilyProvider);
module.exports = TavilyProvider;
