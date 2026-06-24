const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_CONTENT_LENGTH = 10000;

function fetchAsMarkdown(urlString) {
  return new Promise((resolve) => {
    const result = {
      title: '',
      content: '',
      url: urlString,
      fetchedAt: new Date().toISOString(),
    };

    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch {
      result.content = 'Invalid URL';
      return resolve(result);
    }

    const mod = parsedUrl.protocol === 'https:' ? https : http;

    const req = mod.get(urlString, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlString).href;
        return resolve(fetchAsMarkdown(redirectUrl));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        result.content = `HTTP ${res.statusCode}`;
        return resolve(result);
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const converted = htmlToMarkdown(raw);
        result.title = converted.title;
        result.content = converted.content.slice(0, MAX_CONTENT_LENGTH);
        resolve(result);
      });
    });

    req.on('error', (err) => {
      result.content = `Fetch error: ${err.message}`;
      resolve(result);
    });

    req.on('timeout', () => {
      req.destroy();
      result.content = 'Request timed out';
      resolve(result);
    });
  });
}

function htmlToMarkdown(html) {
  let title = '';

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Strip scripts and styles
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  // Try to extract main content
  let main = cleaned.match(/<article[\s\S]*?<\/article>/i);
  if (!main) main = cleaned.match(/<main[\s\S]*?<\/main>/i);
  if (!main) main = cleaned.match(/<div[^>]*class="[^"]*content[^"]*"[\s\S]*?<\/div>/i);
  if (!main) main = cleaned.match(/<body[\s\S]*?<\/body>/i);

  const bodyContent = main ? main[0] : cleaned;

  // Remove remaining tags, convert to text
  let text = bodyContent
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c))
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return { title, content: text };
}

module.exports = { fetchAsMarkdown };
