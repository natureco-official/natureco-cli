/**
 * Google Chat.
 *
 * Two credentials, either or both:
 *   - an incoming webhook URL: outbound only, no Google Cloud project needed,
 *     and the fastest way to get replies flowing into one space;
 *   - a service-account key file: lets the bot answer in any space it is added
 *     to, and is what `spaces.list` is probed with.
 *
 * Inbound is an HTTPS endpoint, so Google Chat needs a public address pointing
 * at the gateway's /webhooks/googlechat path.
 *
 * NOT YET VERIFIED AGAINST A LIVE WORKSPACE.
 */

const fs = require('fs');
const crypto = require('crypto');
const { createChannelCommand } = require('../utils/channel-setup');
const { getLang: _gl } = require('../utils/i18n');

const L = (tr, en) => (_gl() === 'en' ? en : tr);

const SCOPE = 'https://www.googleapis.com/auth/chat.bot';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Service-account access token via a signed JWT assertion.
 *
 * Done by hand rather than pulling in googleapis: this is ~20 lines against a
 * documented endpoint, versus a dependency that would land in every install
 * whether or not Google Chat is used.
 */
async function fetchGoogleToken(keyFilePath) {
  const raw = fs.readFileSync(keyFilePath, 'utf8');
  const key = JSON.parse(raw);
  if (!key.client_email || !key.private_key) {
    throw new Error(L(
      'Anahtar dosyasında client_email veya private_key yok',
      'The key file has no client_email or private_key',
    ));
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signature = base64url(
    crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), key.private_key),
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 200);
    try { detail = JSON.parse(text).error_description || detail; } catch { /* keep raw */ }
    const error = new Error(`HTTP ${res.status}: ${detail}`);
    error.status = res.status;
    throw error;
  }
  return { ...JSON.parse(text), clientEmail: key.client_email };
}

const descriptor = {
  id: 'googlechat',
  label: 'Google Chat',
  inbound: 'webhook',
  webhookPath: '/webhooks/googlechat',
  dmPolicy: true,
  instructions: () => [
    L('Google Chat için iki seçenek var (biri yeterli):', 'Google Chat offers two options (either is enough):'),
    L('A) Sadece gönderme — Space > Apps & integrations > Webhooks > yeni webhook', 'A) Send only — Space > Apps & integrations > Webhooks > new webhook'),
    L('B) Tam bot — Google Cloud > Chat API > yapılandır, servis hesabı anahtarı indir', 'B) Full bot — Google Cloud > Chat API > configure, download a service account key'),
    L('   Tam bot için "App URL" olarak gateway webhook adresinizi girin', '   For the full bot, set "App URL" to your gateway webhook address'),
  ],
  fields: [
    {
      key: 'webhookUrl',
      label: () => L('Webhook URL', 'Webhook URL'),
      message: () => L('Gelen webhook URL (sadece gönderme için; yoksa boş):', 'Incoming webhook URL (send-only; blank if unused):'),
      required: false,
      normalize: value => value.trim(),
    },
    {
      key: 'keyFile',
      label: () => L('Servis hesabı anahtarı', 'Service account key'),
      message: () => L('Servis hesabı JSON dosya yolu (tam bot için; yoksa boş):', 'Service account JSON file path (for the full bot; blank if unused):'),
      required: false,
      normalize: value => value.trim().replace(/^["']|["']$/g, ''),
    },
  ],
  probe: async ({ webhookUrl, keyFile }) => {
    if (!webhookUrl && !keyFile) {
      return {
        ok: false,
        error: L('Ne webhook URL ne de anahtar dosyası verilmiş', 'Neither a webhook URL nor a key file was provided'),
        hint: L('En az birini girin: natureco googlechat connect', 'Provide at least one: natureco googlechat connect'),
      };
    }

    const lines = [];

    if (keyFile) {
      if (!fs.existsSync(keyFile)) {
        return {
          ok: false,
          error: L(`Anahtar dosyası bulunamadı: ${keyFile}`, `Key file not found: ${keyFile}`),
        };
      }
      let token;
      try {
        token = await fetchGoogleToken(keyFile);
      } catch (error) {
        return {
          ok: false,
          error: error.message,
          hint: L('Servis hesabında Chat API yetkisi olduğundan emin olun.', 'Make sure the service account is authorized for the Chat API.'),
        };
      }
      lines.push([L('Servis hesabı', 'Service account'), token.clientEmail]);

      const res = await fetch('https://chat.googleapis.com/v1/spaces', {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text();
        return {
          ok: false,
          error: `spaces.list HTTP ${res.status}: ${body.slice(0, 150)}`,
          hint: L('Uygulamanın en az bir alana (space) eklenmiş olması gerekir.', 'The app must be added to at least one space.'),
        };
      }
      const { spaces = [] } = await res.json();
      lines.push([L('Erişilen alan', 'Spaces reachable'), spaces.length]);
      for (const space of spaces.slice(0, 5)) {
        lines.push(['  ' + (space.displayName || space.name), space.name]);
      }
    }

    if (webhookUrl) {
      if (!/^https:\/\/chat\.googleapis\.com\//.test(webhookUrl)) {
        return {
          ok: false,
          error: L('Webhook URL chat.googleapis.com ile başlamalı', 'The webhook URL must start with chat.googleapis.com'),
        };
      }
      lines.push([L('Webhook', 'Webhook'), L('biçim geçerli (mesaj göndermeden doğrulanamaz)', 'format valid (cannot verify without sending a message)')]);
    }

    return {
      ok: true,
      lines,
      hint: keyFile
        ? undefined
        : L(
          'Sadece webhook yapılandırıldı: bot gönderir ama gelen mesaj alamaz.',
          'Only the webhook is configured: the bot can send but cannot receive.',
        ),
    };
  },
};

module.exports = createChannelCommand(descriptor);
module.exports.descriptor = descriptor;
module.exports.fetchGoogleToken = fetchGoogleToken;
