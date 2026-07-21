const { SearchProvider, registerProvider } = require('../../utils/search-provider');

function decodeHtml(value) {
  let decoded = value;
  for (let pass = 0; pass < 5; pass++) {
    const next = decoded.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
      const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
      if (code[0] !== '#') return named[code.toLowerCase()] || entity;
      const hex = code[1].toLowerCase() === 'x';
      const point = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point >= 0 && point <= 0x10FFFF ? String.fromCodePoint(point) : entity;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function cleanText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, '')).trim();
}

function resultUrl(value) {
  const decoded = decodeHtml(value);
  try {
    const url = new URL(decoded, 'https://duckduckgo.com');
    if (url.hostname.endsWith('duckduckgo.com') && url.pathname === '/l/') {
      const target = url.searchParams.get('uddg');
      if (target) return new URL(target, 'https://duckduckgo.com').href;
    }
    return url.href;
  } catch {
    return decoded.startsWith('//') ? 'https:' + decoded : decoded;
  }
}

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
        title: cleanText(match[2]),
        snippet: cleanText(match[3]),
        url: resultUrl(match[1]),
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
