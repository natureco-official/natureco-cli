/**
 * v5.43 GÜVENLİK — kanal gönderen doğrulaması + hafıza izolasyonu (Madde 7).
 *
 * Slack/Signal/IRC/Mattermost'ta allow-list kontrolü YOKTU ve tüm kanallar paylaşımlı
 * 'universal-provider' hafızasını system prompt'a ekliyordu → yetkisiz/yabancı gönderene
 * kişisel hafıza sızabiliyordu. channelGate: allow-list kuruluysa yetkisizi engeller;
 * kurulu değilse yanıt verir ama hafızayı ENJEKTE ETMEZ (trusted=false).
 */
import { describe, it, expect } from 'vitest';
import gatewayServer from '../../src/commands/gateway-server.js';

const { channelGate } = gatewayServer;

describe('channelGate — gönderen doğrulaması + hafıza izolasyonu', () => {
  it('allow-list kurulu DEĞİLSE: pairing varsayılanıyla engeller', () => {
    const g = channelGate({}, 'signal', '+905551234567', {
      isPaired: () => false,
      ensurePendingPairing: () => ({ id: 'pair_test' }),
    });
    expect(g.allowed).toBe(false);
    expect(g.trusted).toBe(false);
    expect(g.reason).toBe('pairing-required');
    expect(g.pairingId).toBe('pair_test');
  });

  it('allow-list kuruluysa yetkili gönderen: izinli + güvenilir (hafıza gider)', () => {
    const cfg = { signalAllowedNumbers: ['+905551234567'], signalDmPolicy: 'allowlist' };
    const g = channelGate(cfg, 'signal', '+905551234567');
    expect(g.allowed).toBe(true);
    expect(g.trusted).toBe(true);
  });

  it('allow-list kuruluysa YETKİSİZ gönderen: engellenir', () => {
    const cfg = { signalAllowedNumbers: ['+905551234567'], signalDmPolicy: 'allowlist' };
    const g = channelGate(cfg, 'signal', '+900000000000');
    expect(g.allowed).toBe(false);
    expect(g.trusted).toBe(false);
  });

  it('farklı kanal anahtarlarını tanır (AllowedChats/AllowedUsers)', () => {
    expect(channelGate({ mattermostAllowedUsers: ['u1'] }, 'mattermost', 'u1').trusted).toBe(true);
    expect(channelGate({ ircAllowedChats: ['nick1'], ircDmPolicy: 'allowlist' }, 'irc', 'nick2').allowed).toBe(false);
  });

  it('sayısal/string tip karışımını normalize eder', () => {
    expect(channelGate({ mattermostAllowedChats: [12345] }, 'mattermost', '12345').trusted).toBe(true);
  });

  it('yalnızca açıkça open seçilmiş kanalda hafızasız erişime izin verir', () => {
    expect(channelGate({ telegramDmPolicy: 'open' }, 'telegram', 'guest'))
      .toMatchObject({ allowed: true, trusted: false, reason: 'open' });
  });
});
