const { getConfig } = require('../utils/config');

module.exports = {
  name: 'parallel_search',
  description: 'Free web search using Parallel (no API key required)',
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
        `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`,
        { headers: { 'User-Agent': 'NatureCo-CLI/2.0' } }
      );

      if (!response.ok) {
        return { success: false, error: `Parallel search error: ${response.status}` };
      }

      const data = await response.json();
      const results = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || 'Summary',
          snippet: data.AbstractText,
          url: data.AbstractURL || ''
        });
      }

      if (data.Results && Array.isArray(data.Results)) {
        for (const r of data.Results) {
          if (results.length >= maxResults) break;
          if (r.Text && r.FirstURL) {
            results.push({ title: r.Text.split(' - ')[0] || r.Text, snippet: r.Text, url: r.FirstURL });
          }
        }
      }

      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const r of data.RelatedTopics) {
          if (results.length >= maxResults) break;
          if (r.Text && r.FirstURL) {
            results.push({ title: r.Text.split(' - ')[0] || r.Text, snippet: r.Text, url: r.FirstURL });
          }
          if (r.Topics && Array.isArray(r.Topics)) {
            for (const t of r.Topics) {
              if (results.length >= maxResults) break;
              if (t.Text && t.FirstURL) {
                results.push({ title: t.Text.split(' - ')[0] || t.Text, snippet: t.Text, url: t.FirstURL });
              }
            }
          }
        }
      }

      return {
        success: true,
        query: params.query,
        results,
        count: results.length,
        source: 'parallel'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
