const https = require('https');
const http = require('http');

const BLOCKED_DOMAINS = new Set([
  'malware.test', 'phishing.test', 'evil.com', 'malicious.com',
  'hackers.org', 'pwned.com', 'ransomware.test',
]);

async function urlSafety(params) {
  const { url, checkType = 'basic' } = params;
  if (!url) return { success: false, error: 'url gerekli' };

  const issues = [];
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, error: 'Gecersiz URL', safe: false };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    issues.push('Desteklenmeyen protokol: ' + parsed.protocol);
  }

  const domain = parsed.hostname.toLowerCase();
  if (BLOCKED_DOMAINS.has(domain)) {
    issues.push('Bilinen tehlikeli domain: ' + domain);
  }

  if (checkType === 'full' || checkType === 'resolve') {
    try {
      const code = await new Promise((resolve) => {
        const req = (parsed.protocol === 'https:' ? https : http).get(url, { timeout: 5000 }, (res) => {
          resolve(res.statusCode);
          res.resume();
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
      });
      if (code >= 400) issues.push('HTTP ' + code + ' dondu');
    } catch { issues.push('Baglanti hatasi'); }
  }

  return {
    safe: issues.length === 0,
    issues: issues.length > 0 ? issues : undefined,
    domain,
    protocol: parsed.protocol,
    url: parsed.href,
  };
}

module.exports = {
  name: 'url_safety',
  description: 'URL guvenlik taramasi: domain kara liste, HTTP durum kodu kontrolu.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Kontrol edilecek URL' },
      checkType: { type: 'string', description: 'basic (domain kontrol) veya full (domain + HTTP resolve)', enum: ['basic', 'full'] },
    },
    required: ['url'],
  },
  async execute(params) { return await urlSafety(params); },
};
