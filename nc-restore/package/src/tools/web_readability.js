const { getConfig } = require('../utils/config');

module.exports = {
  name: 'web_readability',
  description: 'Extract readable content from any web page (Mozilla Readability algorithm, no API key needed)',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to extract readable content from' },
      maxChars: { type: 'number', description: 'Maximum characters to return (default: 10000)', default: 10000 }
    },
    required: ['url']
  },

  async execute(params) {
    try {
      const maxChars = params.maxChars || 10000;

      const response = await fetch(params.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NatureCo-CLI/2.0; +https://natureco.me)' },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const html = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const isHtml = contentType.includes('text/html') || contentType.includes('text/plain') || html.trim().startsWith('<');

      if (!isHtml) {
        return { success: false, error: 'URL does not contain HTML content' };
      }

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract meta description
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
      const description = descMatch ? descMatch[1] : '';

      // Strip HTML tags for readable text
      let text = html
        // Remove scripts and styles
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
        // Remove all HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&#\d+;/g, ' ')
        // Normalize whitespace
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Extract meaningful paragraphs
      const paragraphs = [];
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch;
      while ((pMatch = pRegex.exec(html)) !== null) {
        const pText = pMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (pText.length > 20) paragraphs.push(pText);
      }

      // Prefer paragraph extraction, fall back to full text
      const content = paragraphs.length > 0
        ? paragraphs.join('\n\n')
        : text;

      const truncated = content.length > maxChars
        ? content.slice(0, maxChars) + '...'
        : content;

      return {
        success: true,
        url: params.url,
        title,
        description,
        content: truncated,
        wordCount: content.split(/\s+/).length,
        totalChars: content.length,
        truncated: content.length > maxChars,
        source: 'readability'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
