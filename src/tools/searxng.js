const { getConfig } = require('../utils/config');

module.exports = {
  name: 'searxng_search',
  description: 'Search the web using a SearXNG instance (self-hosted privacy search)',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      instanceUrl: { type: 'string', description: 'SearXNG instance URL (default: config.searxngInstanceUrl or https://search.sapti.me)' },
      maxResults: { type: 'number', description: 'Maximum results (default: 5)', default: 5 },
      categories: { type: 'string', description: 'Search categories: general, news, images, video, files (default: general)' }
    },
    required: ['query']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const instanceUrl = (params.instanceUrl || config.searxngInstanceUrl || 'https://search.sapti.me').replace(/\/+$/, '');
      const maxResults = params.maxResults || 5;

      const searchParams = new URLSearchParams({
        q: params.query,
        format: 'json',
        language: 'en',
        categories: params.categories || 'general',
        pageno: 1
      });

      const response = await fetch(`${instanceUrl}/search?${searchParams}`, {
        headers: { 'User-Agent': 'NatureCo-CLI/2.0', 'Accept': 'application/json' }
      });

      if (!response.ok) {
        return { success: false, error: `SearXNG error: ${response.status}` };
      }

      const data = await response.json();

      const results = (data.results || []).slice(0, maxResults).map(r => ({
        title: r.title,
        snippet: r.content,
        url: r.url,
        engine: r.engine,
        category: r.category
      }));

      return {
        success: true,
        query: params.query,
        instance: instanceUrl,
        results,
        count: results.length,
        source: 'searxng'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
