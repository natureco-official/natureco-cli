const https = require('https');

async function xSearch(params) {
  const { query, maxResults = 5, apiKey } = params;
  if (!query) return { success: false, error: 'query gerekli' };
  const key = apiKey || process.env.X_API_KEY || process.env.TWITTER_API_KEY;
  if (!key) return { success: false, error: 'X API anahtari gerekli (X_API_KEY veya TWITTER_API_KEY ortam degiskeni)' };

  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query);
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encoded}&max_results=${Math.min(maxResults, 100)}&tweet.fields=created_at,public_metrics`;
    const req = https.get(url, {
      headers: { 'Authorization': `Bearer ${key}` },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const tweets = (parsed.data || []).map(t => ({
            id: t.id, text: t.text, createdAt: t.created_at,
            likes: t.public_metrics?.like_count || 0, retweets: t.public_metrics?.retweet_count || 0,
          }));
          resolve({ success: true, query, count: tweets.length, tweets, meta: parsed.meta });
        } catch { resolve({ success: false, error: 'Yanit cozumlenemedi' }); }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
  });
}

module.exports = {
  name: 'x_search',
  description: 'X/Twitter API v2 ile tweet aramasi. X_API_KEY veya TWITTER_API_KEY ortam degiskeni gerekli.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Arama sorgusu' },
      maxResults: { type: 'number', description: 'Maksimum tweet sayisi (default: 5, max: 100)' },
      apiKey: { type: 'string', description: 'Opsiyonel: API anahtari (default: X_API_KEY env)' },
    },
    required: ['query'],
  },
  async execute(params) { return await xSearch(params); },
};
