/**
 * Microsoft Teams — via the Bot Framework.
 *
 * Outbound needs an AAD client-credentials token, which is also what `probe`
 * checks: if the app id and password can mint a token, the registration is
 * sound. Inbound is a webhook, so Teams needs a public HTTPS address pointing
 * at the gateway's /webhooks/teams path.
 *
 * NOT YET VERIFIED AGAINST A LIVE BOT REGISTRATION.
 */

const { createChannelCommand } = require('../utils/channel-setup');
const { getLang: _gl } = require('../utils/i18n');

const L = (tr, en) => (_gl() === 'en' ? en : tr);

const TOKEN_URL = 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token';
const SCOPE = 'https://api.botframework.com/.default';

/**
 * Mint a Bot Framework token. Exported because the gateway needs the same call
 * to send messages, and duplicating it would let the two drift apart.
 */
async function fetchTeamsToken({ appId, appPassword, tenantId }) {
  const url = tenantId
    ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
    : TOKEN_URL;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: appId,
    client_secret: appPassword,
    scope: SCOPE,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
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
  return JSON.parse(text);
}

const descriptor = {
  id: 'teams',
  label: 'Microsoft Teams',
  inbound: 'webhook',
  webhookPath: '/webhooks/teams',
  dmPolicy: true,
  instructions: () => [
    L('Teams bot kimlik bilgileri için:', 'To get Teams bot credentials:'),
    L('1. Azure Portal > Azure Bot kaynağı oluşturun', '1. Azure Portal > create an Azure Bot resource'),
    L('2. Microsoft App ID\'yi kopyalayın', '2. Copy the Microsoft App ID'),
    L('3. Sertifikalar & Gizli Anahtarlar > yeni istemci gizli anahtarı oluşturun', '3. Certificates & Secrets > create a new client secret'),
    L('4. Kanallar > Microsoft Teams kanalını ekleyin', '4. Channels > add the Microsoft Teams channel'),
    L('5. Messaging endpoint olarak gateway webhook adresinizi girin', '5. Set the messaging endpoint to your gateway webhook address'),
  ],
  fields: [
    {
      key: 'appId',
      label: () => L('Uygulama kimliği', 'App ID'),
      message: () => L('Microsoft App ID:', 'Microsoft App ID:'),
      required: true,
    },
    {
      key: 'appPassword',
      label: () => L('İstemci gizli anahtarı', 'Client secret'),
      message: () => L('İstemci gizli anahtarı (boş bırakırsanız mevcut korunur):', 'Client secret (leave blank to keep the current one):'),
      required: true,
      secret: true,
    },
    {
      key: 'tenantId',
      label: () => L('Kiracı kimliği', 'Tenant ID'),
      message: () => L('Kiracı kimliği (tek kiracılı bot için; boş = çok kiracılı):', 'Tenant ID (for single-tenant bots; blank = multi-tenant):'),
      required: false,
    },
  ],
  probe: async ({ appId, appPassword, tenantId }) => {
    try {
      const token = await fetchTeamsToken({ appId, appPassword, tenantId });
      return {
        ok: true,
        lines: [
          [L('Uygulama kimliği', 'App ID'), appId],
          [L('Kiracı', 'Tenant'), tenantId || L('çok kiracılı', 'multi-tenant')],
          [L('Token türü', 'Token type'), token.token_type || 'Bearer'],
          [L('Geçerlilik', 'Expires in'), `${token.expires_in || '?'}s`],
        ],
        hint: L(
          'Kimlik bilgileri geçerli. Gelen mesaj için messaging endpoint\'in gateway\'e baktığından emin olun.',
          'Credentials are valid. Make sure the messaging endpoint points at your gateway for inbound messages.',
        ),
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message,
        hint: error.status === 401
          ? L('App ID veya gizli anahtar yanlış.', 'The app ID or client secret is wrong.')
          : L('Kiracı kimliğini ve uygulama kaydını kontrol edin.', 'Check the tenant ID and the app registration.'),
      };
    }
  },
};

module.exports = createChannelCommand(descriptor);
module.exports.descriptor = descriptor;
module.exports.fetchTeamsToken = fetchTeamsToken;
