const https = require('https');

async function discord(params) {
  const { action, webhookUrl, channel, message, username, avatarUrl, embeds } = params;

  if (action === 'send_webhook') {
    if (!webhookUrl || !message) return { success: false, error: 'webhookUrl ve message gerekli' };
    const payload = { content: message };
    if (username) payload.username = username;
    if (avatarUrl) payload.avatar_url = avatarUrl;
    if (embeds) payload.embeds = embeds;

    return new Promise((resolve) => {
      const urlObj = new URL(webhookUrl);
      const data = JSON.stringify(payload);
      const req = https.request(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 10000,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode === 204 || res.statusCode === 200) {
            resolve({ success: true, message: 'Mesaj gonderildi' });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` });
          }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
      req.write(data);
      req.end();
    });
  }

  if (action === 'format_message') {
    const parts = [];
    if (channel) parts.push(`**#${channel}**`);
    if (message) parts.push(message);
    return { success: true, formatted: parts.join('\n') };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (desteklenen: send_webhook, format_message)' };
}

module.exports = {
  name: 'discord',
  description: 'Discord mesaji gonderme: webhook ile. Ayrica mesaj formatlama yardimcisi.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'send_webhook, format_message', enum: ['send_webhook', 'format_message'] },
      webhookUrl: { type: 'string', description: '(send_webhook) Discord webhook URL' },
      message: { type: 'string', description: 'Mesaj icerigi' },
      channel: { type: 'string', description: 'Opsiyonel: kanal adi (formatlama icin)' },
      username: { type: 'string', description: 'Opsiyonel: webhook goruntulenen ad' },
      avatarUrl: { type: 'string', description: 'Opsiyonel: webhook avatar URL' },
      embeds: { type: 'array', description: 'Opsiyonel: Discord embed nesneleri', items: { type: 'object' } },
    },
    required: ['action'],
  },
  async execute(params) { return await discord(params); },
};
