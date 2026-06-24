const { getConfig } = require('../utils/config');

async function tryPlaywright(action, params) {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();

      if (action === 'open') {
        await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30000 });
        const title = await page.title();
        const content = await page.evaluate(() => document.body.innerText);
        return { success: true, action, title, url: params.url, content: content.substring(0, 10000) };
      }

      if (action === 'screenshot') {
        await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30000 });
        const screenshot = await page.screenshot({ type: 'png', fullPage: params.fullPage !== false });
        return { success: true, action, url: params.url, screenshot: screenshot.toString('base64'), format: 'png' };
      }

      if (action === 'evaluate') {
        await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30000 });
        const result = await page.evaluate(params.script);
        return { success: true, action, url: params.url, result: JSON.stringify(result) };
      }

      if (action === 'html') {
        await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();
        return { success: true, action, url: params.url, html: html.substring(0, 50000) };
      }

      return { success: false, error: `Unknown browser action: ${action}` };
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      return { success: false, error: 'Playwright kurulu değil. Yüklemek için: npm install playwright', fallback: true };
    }
    return { success: false, error: err.message };
  }
}

async function httpFallback(url) {
  try {
    const https = require('https');
    const http = require('http');
    const transport = url.startsWith('https') ? https : http;

    return new Promise((resolve) => {
      const req = transport.get(url, { headers: { 'User-Agent': 'NatureCo-CLI/2.0' }, timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const title = data.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || '';
          const text = data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          resolve({ success: true, action: 'open', title, url, content: text.substring(0, 10000), mode: 'http-fallback' });
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  name: 'browser',
  description: 'Headless browser automation — open URLs, take screenshots, evaluate JS, get HTML. Uses Playwright if available, falls back to HTTP.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action: open, screenshot, evaluate, html', enum: ['open', 'screenshot', 'evaluate', 'html'] },
      url: { type: 'string', description: 'URL to navigate to' },
      script: { type: 'string', description: 'JavaScript to evaluate (for evaluate action)' },
      fullPage: { type: 'boolean', description: 'Full page screenshot (default: true)' }
    },
    required: ['action', 'url']
  },

  async execute(params) {
    if (params.action === 'open') {
      const pw = await tryPlaywright('open', params);
      if (pw.fallback) return httpFallback(params.url);
      return pw;
    }

    if (params.action === 'screenshot') {
      const pw = await tryPlaywright('screenshot', params);
      if (pw.fallback) return { success: false, error: 'Screenshot için Playwright gerekli. Kur: npm install playwright' };
      return pw;
    }

    if (params.action === 'evaluate') {
      const pw = await tryPlaywright('evaluate', params);
      if (pw.fallback) return { success: false, error: 'JS evaluate için Playwright gerekli. Kur: npm install playwright' };
      return pw;
    }

    if (params.action === 'html') {
      const pw = await tryPlaywright('html', params);
      if (pw.fallback) return httpFallback(params.url);
      return pw;
    }

    return { success: false, error: `Unknown action: ${params.action}` };
  }
};
