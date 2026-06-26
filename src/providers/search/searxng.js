const { SearchProvider, registerProvider } = require('../../utils/search-provider');

class SearXNGProvider extends SearchProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'searxng';
  }

  async search(query, options = {}) {
    const instanceUrl = (options.instanceUrl || this.config.searxngInstanceUrl || 'https://search.sapti.me').replace(/\/+$/, '');
    const maxResults = options.maxResults || 5;

    const searchParams = new URLSearchParams({
      q: query,
      format: 'json',
      language: 'en',
      categories: options.categories || 'general',
      pageno: 1,
    });

    const response = await fetch(`${instanceUrl}/search?${searchParams}`, {
      headers: { 'User-Agent': 'NatureCo-CLI/2.0', 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return { success: false, error: `SearXNG error: ${response.status}`, provider: this.name };
    }

    const data = await response.json();
    const raw = (data.results || []).slice(0, maxResults);
    const results = raw.map(r => ({
      title: r.title,
      snippet: r.content,
      url: r.url,
      engine: r.engine,
      category: r.category,
    }));

    return {
      success: true,
      query,
      instance: instanceUrl,
      results,
      count: results.length,
      provider: this.name,
    };
  }
}

registerProvider('searxng', SearXNGProvider);
module.exports = SearXNGProvider;
