const { getConfig } = require('../utils/config');

module.exports = {
  name: 'firecrawl',
  description: 'Scrape and crawl web pages using Firecrawl — extracts markdown content from any URL',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to scrape or crawl' },
      mode: { type: 'string', description: 'Mode: scrape (single page) or crawl (entire site, max 10 pages)', enum: ['scrape', 'crawl'], default: 'scrape' },
      maxPages: { type: 'number', description: 'Max pages to crawl (default: 5, max: 10)', default: 5 },
      formats: { type: 'array', items: { type: 'string' }, description: 'Output formats: markdown, html, rawHtml, screenshot (default: markdown)' }
    },
    required: ['url']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const apiKey = config.firecrawlApiKey || process.env.FIRECRAWL_API_KEY;

      if (!apiKey) {
        return {
          success: false,
          error: 'Firecrawl API key gerekli. Kur: natureco config set firecrawlApiKey <key>\nKey al: https://www.firecrawl.dev'
        };
      }

      const formats = params.formats || ['markdown'];
      const maxPages = Math.min(params.maxPages || 5, 10);

      if (params.mode === 'crawl') {
        // Crawl mode
        const crawlResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            url: params.url,
            limit: maxPages,
            scrapeOptions: { formats }
          })
        });

        if (!crawlResponse.ok) {
          return { success: false, error: `Firecrawl crawl error: ${crawlResponse.status}` };
        }

        const { id } = await crawlResponse.json();

        // Poll for results
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          if (!statusResponse.ok) continue;

          const statusData = await statusResponse.json();
          if (statusData.status === 'completed') {
            return {
              success: true,
              url: params.url,
              mode: 'crawl',
              pages: (statusData.data || []).map(p => ({
                url: p.url || p.metadata?.url,
                content: p.markdown || '',
                title: p.metadata?.title
              })),
              count: statusData.data?.length || 0,
              source: 'firecrawl'
            };
          }
        }

        return { success: false, error: 'Firecrawl crawl timed out' };
      }

      // Scrape mode
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ url: params.url, formats })
      });

      if (!response.ok) {
        return { success: false, error: `Firecrawl scrape error: ${response.status}` };
      }

      const data = await response.json();

      return {
        success: true,
        url: params.url,
        mode: 'scrape',
        content: data.data?.markdown || data.data?.content || '',
        title: data.data?.metadata?.title,
        description: data.data?.metadata?.description,
        source: 'firecrawl'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
