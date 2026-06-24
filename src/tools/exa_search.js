const { getConfig } = require('../utils/config');

module.exports = {
  name: 'exa_search',
  description: 'Search the web using Exa (exa.ai) — AI-powered search with content extraction',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5)', default: 5 },
      type: { type: 'string', description: 'Search type: keyword, neural, auto (default: auto)', enum: ['keyword', 'neural', 'auto'] },
      includeText: { type: 'array', items: { type: 'string' }, description: 'Keywords that must appear' },
      excludeText: { type: 'array', items: { type: 'string' }, description: 'Keywords to exclude' }
    },
    required: ['query']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const apiKey = config.exaApiKey || process.env.EXA_API_KEY;

      if (!apiKey) {
        return {
          success: false,
          error: 'Exa API key gerekli. Kur: natureco config set exaApiKey <key>\nKey al: https://dashboard.exa.ai/api-keys'
        };
      }

      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          query: params.query,
          type: params.type || 'auto',
          numResults: params.maxResults || 5,
          includeTerms: params.includeText,
          excludeTerms: params.excludeText
        })
      });

      if (!response.ok) {
        const err = await response.text().catch(() => '');
        return { success: false, error: `Exa error ${response.status}: ${err}` };
      }

      const data = await response.json();

      return {
        success: true,
        query: params.query,
        results: (data.results || []).map(r => ({
          title: r.title,
          snippet: r.text,
          url: r.url,
          score: r.score,
          publishedDate: r.publishedDate
        })),
        count: data.results?.length || 0,
        source: 'exa'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
