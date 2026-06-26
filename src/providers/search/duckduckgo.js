const { SearchProvider, registerProvider } = require('../../utils/search-provider');

class DuckDuckGoProvider extends SearchProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'duckduckgo';
  }

  async search(query, options = {}) {
    const maxResults = options.maxResults || 5;
    const encoded = encodeURIComponent(query);

    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encoded}`,
      { headers: { 'User-Agent': 'NatureCo-CLI/2.0' } }
    );

    if (!response.ok) {
      return { success: false, error: `DuckDuckGo error: ${response.status}`, provider: this.name };
    }

    const html = await response.text();
    const results = [];
    const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: match[2].replace(/<[^>]+>/g, '').trim(),
        snippet: match[3].replace(/<[^>]+>/g, '').trim(),
        url: match[1],
      });
    }

    return {
      success: true,
      query,
      results,
      count: results.length,
      provider: this.name,
    };
  }
}

registerProvider('duckduckgo', DuckDuckGoProvider);
module.exports = DuckDuckGoProvider;
