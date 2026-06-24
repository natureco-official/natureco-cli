const { getConfig } = require('../utils/config');

module.exports = {
  name: 'web_search',
  description: 'Search the web for current information using Tavily',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      }
    },
    required: ['query']
  },
  
  async execute(params) {
    try {
      const config = getConfig();
      const apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY;
      
      if (!apiKey) {
        return {
          success: false,
          error: 'Tavily API key gerekli. Kur: natureco config set tavilyApiKey tvly_xxx\nÜcretsiz key: https://tavily.com'
        };
      }
      
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: params.query,
          search_depth: 'basic',
          max_results: 5
        })
      });
      
      if (!response.ok) {
        return {
          success: false,
          error: `Tavily API error: ${response.status} ${response.statusText}`
        };
      }
      
      const data = await response.json();
      
      if (data.error) {
        return {
          success: false,
          error: data.error
        };
      }
      
      if (!data.results || data.results.length === 0) {
        return {
          success: true,
          message: 'Sonuç bulunamadı',
          query: params.query,
          results: []
        };
      }
      
      return {
        success: true,
        query: params.query,
        results: data.results.map(r => ({
          title: r.title,
          snippet: r.content,
          url: r.url
        })),
        count: data.results.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
