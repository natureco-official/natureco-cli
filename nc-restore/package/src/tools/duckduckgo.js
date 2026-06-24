const { getConfig } = require('../utils/config');

module.exports = {
  name: 'duckduckgo_search',
  description: 'Search the web using DuckDuckGo (no API key required)',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5)', default: 5 }
    },
    required: ['query']
  },

  async execute(params) {
    try {
      const query = encodeURIComponent(params.query);
      const maxResults = params.maxResults || 5;

      const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${query}`,
        { headers: { 'User-Agent': 'NatureCo-CLI/2.0' } }
      );

      if (!response.ok) {
        return { success: false, error: `DuckDuckGo error: ${response.status}` };
      }

      const html = await response.text();

      // Extract result snippets from DuckDuckGo HTML
      const results = [];
      const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        results.push({
          title: match[2].replace(/<[^>]+>/g, '').trim(),
          snippet: match[3].replace(/<[^>]+>/g, '').trim(),
          url: match[1]
        });
      }

      return {
        success: true,
        query: params.query,
        results,
        count: results.length,
        source: 'duckduckgo'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
