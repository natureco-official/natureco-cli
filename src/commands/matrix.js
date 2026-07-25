/**
 * Matrix — open federated messaging (Element, matrix.org, self-hosted Synapse).
 *
 * Uses the Client-Server API directly over HTTPS: no SDK, no webhook. Inbound
 * arrives from long-polling `/sync`, which means it works behind NAT with no
 * public address — the only one of the four new channels that does.
 *
 * NOT YET VERIFIED AGAINST A LIVE HOMESERVER.
 */

const { createChannelCommand } = require('../utils/channel-setup');
const { getLang: _gl } = require('../utils/i18n');

const L = (tr, en) => (_gl() === 'en' ? en : tr);

const descriptor = {
  id: 'matrix',
  label: 'Matrix',
  inbound: 'poll',
  dmPolicy: true,
  instructions: () => [
    L('Matrix erişim tokenı almak için:', 'To get a Matrix access token:'),
    L('1. Bir hesap açın (matrix.org veya kendi Synapse sunucunuz)', '1. Create an account (matrix.org or your own Synapse server)'),
    L('2. Element > Ayarlar > Yardım & Hakkında > Gelişmiş > Erişim Tokenı', '2. Element > Settings > Help & About > Advanced > Access Token'),
    L('   veya: curl -XPOST <homeserver>/_matrix/client/v3/login \\', '   or: curl -XPOST <homeserver>/_matrix/client/v3/login \\'),
    '        -d \'{"type":"m.login.password","user":"bot","password":"…"}\'',
    L('3. Botu ilgili odalara davet edip kabul ettirin', '3. Invite the bot to the rooms it should serve and accept'),
  ],
  fields: [
    {
      key: 'homeserver',
      label: () => L('Homeserver', 'Homeserver'),
      message: () => L('Homeserver URL (örn. https://matrix.org):', 'Homeserver URL (e.g. https://matrix.org):'),
      required: true,
      default: 'https://matrix.org',
      normalize: value => value.replace(/\/+$/, ''),
    },
    {
      key: 'token',
      label: () => L('Erişim tokenı', 'Access token'),
      message: () => L('Erişim tokenı (boş bırakırsanız mevcut korunur):', 'Access token (leave blank to keep the current one):'),
      required: true,
      secret: true,
    },
    {
      key: 'userId',
      label: () => L('Kullanıcı kimliği', 'User ID'),
      message: () => L('Bot kullanıcı kimliği (örn. @bot:matrix.org, boş = probe ile bulunur):', 'Bot user ID (e.g. @bot:matrix.org, blank = discovered by probe):'),
      required: false,
    },
  ],
  probe: async ({ homeserver, token }) => {
    const res = await fetch(`${homeserver}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        hint: res.status === 401
          ? L('Token geçersiz veya süresi dolmuş.', 'The token is invalid or expired.')
          : L('Homeserver adresini kontrol edin.', 'Check the homeserver address.'),
      };
    }
    const me = await res.json();

    const lines = [[L('Kullanıcı kimliği', 'User ID'), me.user_id]];
    if (me.device_id) lines.push([L('Cihaz', 'Device'), me.device_id]);

    // Joined rooms tell the user whether the bot can actually be reached.
    try {
      const roomsRes = await fetch(`${homeserver}/_matrix/client/v3/joined_rooms`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (roomsRes.ok) {
        const { joined_rooms: rooms = [] } = await roomsRes.json();
        lines.push([L('Katıldığı oda', 'Joined rooms'), rooms.length]);
        if (rooms.length === 0) {
          return { ok: true, lines, hint: L('Bot hiçbir odada değil — bir odaya davet edin.', 'The bot is in no rooms — invite it to one.') };
        }
      }
    } catch { /* room listing is informational only */ }

    return { ok: true, lines };
  },
};

module.exports = createChannelCommand(descriptor);
module.exports.descriptor = descriptor;
