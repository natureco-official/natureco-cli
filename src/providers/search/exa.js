const { SearchProvider, registerProvider } = require('../../utils/search-provider');

class ExaProvider extends SearchProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'exa';
  }

  async search(query, options = {}) {
    const apiKey = this.config.exaApiKey || process.env.EXA_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Exa API key gerekli. Kur: natureco config set exaApiKey <key>', provider: this.name };
    }

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query,
        type: options.type || 'auto',
        numResults: options.maxResults || 5,
        includeTerms: options.includeTerms,
        excludeTerms: options.excludeTerms,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      return { success: false, error: `Exa error ${response.status}: ${err}`, provider: this.name };
    }

    const data = await response.json();
    const results = (data.results || []).map(r => ({
      title: r.title,
      snippet: r.text,
      url: r.url,
      score: r.score,
      publishedDate: r.publishedDate,
    }));

    return {
      success: true,
      query,
      results,
      count: results.length,
      provider: this.name,
    };
  }
}

registerProvider('exa', ExaProvider);
module.exports = ExaProvider;
