/**
 * Zalo — via the Official Account (OA) Open API.
 *
 * Outbound uses the customer-service message endpoint, which Zalo only allows
 * inside a window after the user last wrote to the OA; that is a platform rule,
 * not a limitation here, and it is surfaced in the probe hint so it is not a
 * surprise later.
 *
 * Inbound is a webhook, so Zalo needs a public HTTPS address pointing at the
 * gateway's /webhooks/zalo path.
 *
 * NOT YET VERIFIED AGAINST A LIVE OFFICIAL ACCOUNT.
 */

const { createChannelCommand } = require('../utils/channel-setup');
const { getLang: _gl } = require('../utils/i18n');

const L = (tr, en) => (_gl() === 'en' ? en : tr);

const API_BASE = 'https://openapi.zalo.me';

const descriptor = {
  id: 'zalo',
  label: 'Zalo',
  inbound: 'webhook',
  webhookPath: '/webhooks/zalo',
  dmPolicy: true,
  instructions: () => [
    L('Zalo OA erişim tokenı için:', 'To get a Zalo OA access token:'),
    L('1. oa.zalo.me üzerinde bir Official Account oluşturun', '1. Create an Official Account at oa.zalo.me'),
    L('2. developers.zalo.me > Uygulamanız > Official Account API', '2. developers.zalo.me > your app > Official Account API'),
    L('3. OA\'yı uygulamaya bağlayıp erişim tokenı üretin', '3. Link the OA to the app and generate an access token'),
    L('4. Webhook adresi olarak gateway yolunuzu girin', '4. Set the webhook address to your gateway path'),
    L('Not: Zalo tokenları kısa ömürlüdür; refresh token ile yenilenir.', 'Note: Zalo tokens are short-lived; refresh them with the refresh token.'),
  ],
  fields: [
    {
      key: 'accessToken',
      label: () => L('Erişim tokenı', 'Access token'),
      message: () => L('OA erişim tokenı (boş bırakırsanız mevcut korunur):', 'OA access token (leave blank to keep the current one):'),
      required: true,
      secret: true,
    },
    {
      key: 'refreshToken',
      label: () => L('Yenileme tokenı', 'Refresh token'),
      message: () => L('Yenileme tokenı (opsiyonel, token yenilemek için):', 'Refresh token (optional, used to renew the token):'),
      required: false,
      secret: true,
    },
    {
      key: 'appSecret',
      label: () => L('Uygulama gizli anahtarı', 'App secret'),
      message: () => L('Uygulama gizli anahtarı (webhook imzasını doğrulamak için):', 'App secret (used to verify the webhook signature):'),
      required: false,
      secret: true,
    },
  ],
  probe: async ({ accessToken }) => {
    const res = await fetch(`${API_BASE}/v2.0/oa/getoa`, {
      headers: { access_token: accessToken },
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 150)}` };
    }

    let payload;
    try { payload = JSON.parse(text); } catch {
      return { ok: false, error: L('Yanıt JSON değil', 'The response is not JSON') };
    }

    // Zalo answers 200 with an error code in the body rather than an HTTP error.
    if (payload.error && payload.error !== 0) {
      return {
        ok: false,
        error: `error ${payload.error}: ${payload.message || 'unknown'}`,
        hint: payload.error === -216 || payload.error === -201
          ? L('Token geçersiz veya süresi dolmuş — yenileyin.', 'The token is invalid or expired — renew it.')
          : undefined,
      };
    }

    const oa = payload.data || {};
    return {
      ok: true,
      lines: [
        [L('OA adı', 'OA name'), oa.name || '—'],
        ['OA ID', oa.oa_id || '—'],
        [L('Takipçi', 'Followers'), oa.num_follower ?? '—'],
        [L('Paket', 'Package'), oa.package_name || '—'],
      ],
      hint: L(
        'Zalo yalnızca kullanıcı son yazdıktan sonraki pencerede mesaj göndermeye izin verir.',
        'Zalo only allows sending inside the window after the user last wrote to the OA.',
      ),
    };
  },
};

module.exports = createChannelCommand(descriptor);
module.exports.descriptor = descriptor;
module.exports.API_BASE = API_BASE;
