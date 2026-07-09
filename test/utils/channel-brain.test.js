/**
 * channel-brain — TEK BEYIN köprüsü (v5.47) regresyonu.
 *
 * KRİTİK bug (split-brain): Telegram/WhatsApp/Signal/IRC/Mattermost/iMessage/SMS
 * kanalları sabit "You are a helpful X assistant" prompt'u + legacy
 * 'universal-provider.json' hafızasıyla konuşuyordu; terminal ise workflow üzerinden
 * gerçek personayı (Hinata) + kullanıcı hafızasını (<user>.json + tree) alıyordu.
 * Sonuç: aynı bot terminalde her şeyi hatırlarken Telegram'da kişiliksiz ve
 * hafızasızdı. runBrain güvenilir kanal mesajını terminaldekiyle AYNI workflow
 * ajanına yönlendirir. Bu testler köprünün davranışını kilitler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import brain from '../../src/utils/channel-brain.js';

const { runBrain, sanitizeReply, chunkText, _internal } = brain;

// Gerçek LLM çağrısı yok: workflow + config dependency-injection ile mock'lanır
// (CJS require'ı vi.mock güvenilir yakalamıyor; runBrain deps parametresi alır).
const executeMock = vi.fn();
const deps = {
  workflow: { execute: (...a) => executeMock(...a) },
  getConfig: () => ({ botName: 'Hinata', userName: 'gencay' }),
};

function cleanupHistory(channel, chatKey) {
  try { fs.unlinkSync(_internal.historyFile(channel, chatKey)); } catch {}
}

describe('sanitizeReply — model adı → bot adı (kişilik tutarlılığı)', () => {
  it('"Ben MiniMax M2.5" artık ".5" artığı bırakmadan bot adına çevrilir', () => {
    expect(sanitizeReply('Ben MiniMax M2.5, size nasil yardimci olabilirim?', 'Hinata'))
      .toBe('Ben Hinata, size nasil yardimci olabilirim?');
  });

  it('Claude/MiniMax token geçişleri bot adı olur', () => {
    expect(sanitizeReply('Merhaba! Ben Claude, bir yapay zekayim.', 'Hinata'))
      .toContain('Ben Hinata');
    expect(sanitizeReply('MiniMax-M2.5 modeliyim', 'Hinata')).toBe('Hinata');
  });

  it('normal metne dokunmaz', () => {
    expect(sanitizeReply('Bugün hava çok güzel, projeye devam edelim.', 'Hinata'))
      .toBe('Bugün hava çok güzel, projeye devam edelim.');
  });
});

describe('chunkText — taşıma katmanı mesaj limiti (Telegram 4096)', () => {
  it('limiti aşan metni parçalara böler, veri kaybetmez', () => {
    const parts = chunkText('a'.repeat(9000), 4000);
    expect(parts.map(p => p.length)).toEqual([4000, 4000, 1000]);
    expect(parts.join('')).toBe('a'.repeat(9000));
  });

  it('satır sınırında bölmeyi tercih eder', () => {
    const text = 'x'.repeat(3000) + '\n' + 'y'.repeat(2000);
    const parts = chunkText(text, 4000);
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe('x'.repeat(3000));
    expect(parts[1]).toBe('y'.repeat(2000));
  });

  it('kısa metin tek parça döner', () => {
    expect(chunkText('merhaba', 4000)).toEqual(['merhaba']);
  });
});

describe('runBrain — kanal mesajı terminaldekiyle AYNI workflow ajanına gider', () => {
  beforeEach(() => { executeMock.mockReset(); });
  afterEach(() => { cleanupHistory('testchan', 'chat1'); cleanupHistory('testchan', 'histcap'); });

  it('workflow.execute action:"run" + task + stream:false ile çağrılır (terminal ile aynı yol)', async () => {
    executeMock.mockResolvedValue({ success: true, passthrough: true, reply: 'Selam!' });
    const reply = await runBrain({ channel: 'testchan', chatKey: 'chat1', text: 'merhaba' }, deps);
    expect(reply).toBe('Selam!');
    expect(executeMock).toHaveBeenCalledTimes(1);
    const args = executeMock.mock.calls[0][0];
    expect(args.action).toBe('run');
    expect(args.task).toBe('merhaba');
    expect(args.stream).toBe(false);
    expect(Array.isArray(args.conversationHistory)).toBe(true);
  });

  it('konuşma geçmişi kalıcıdır ve ikinci çağrıda modele gider (kanal içi süreklilik)', async () => {
    executeMock.mockResolvedValue({ success: true, passthrough: true, reply: 'ilk yanıt' });
    await runBrain({ channel: 'testchan', chatKey: 'chat1', text: 'ilk mesaj' }, deps);
    executeMock.mockResolvedValue({ success: true, passthrough: true, reply: 'ikinci yanıt' });
    await runBrain({ channel: 'testchan', chatKey: 'chat1', text: 'ikinci mesaj' }, deps);
    const hist = executeMock.mock.calls[1][0].conversationHistory;
    expect(hist).toEqual([
      { role: 'user', content: 'ilk mesaj' },
      { role: 'assistant', content: 'ilk yanıt' },
    ]);
  });

  it('yanıt model-adı temizliğinden geçer (Telegram\'da da "Ben Hinata")', async () => {
    executeMock.mockResolvedValue({ success: true, passthrough: true, reply: 'Ben MiniMax M2.5, buradayim.' });
    const reply = await runBrain({ channel: 'testchan', chatKey: 'chat1', text: 'sen kimsin' }, deps);
    expect(reply).toBe('Ben Hinata, buradayim.');
  });

  it('reply olmayan tamamlanmış çalıştırmada adım özetine düşer (tool_calls yolu)', async () => {
    executeMock.mockResolvedValue({
      success: true, status: 'completed',
      results: [{ tool: 'write_file', status: 'done' }, { tool: 'bash', status: 'done' }],
    });
    const reply = await runBrain({ channel: 'testchan', chatKey: 'chat1', text: 'dosya yaz' }, deps);
    expect(reply).toContain('✓ write_file');
    expect(reply).toContain('✓ bash');
  });

  it('workflow hatası kullanıcıya nazik mesaj olarak döner (sessiz kalmaz)', async () => {
    executeMock.mockResolvedValue({ success: false, error: 'provider down' });
    const reply = await runBrain({ channel: 'testchan', chatKey: 'chat1', text: 'merhaba' }, deps);
    expect(reply).toContain('provider down');
  });

  it('geçmiş MAX_HISTORY ile sınırlanır (dosya sınırsız büyümez)', async () => {
    executeMock.mockResolvedValue({ success: true, passthrough: true, reply: 'ok' });
    for (let i = 0; i < 30; i++) {
      await runBrain({ channel: 'testchan', chatKey: 'histcap', text: 'mesaj ' + i }, deps);
    }
    const hist = _internal.loadHistory('testchan', 'histcap');
    expect(hist.length).toBeLessThanOrEqual(_internal.MAX_HISTORY);
    // en yeni mesaj korunur (baştan değil sondan tutulur)
    expect(hist[hist.length - 2].content).toBe('mesaj 29');
  });

  it('chatKey dosya adına güvenli biçimde yansır (path traversal yok)', () => {
    const f = _internal.historyFile('telegram', '../../etc/passwd');
    expect(path.basename(f)).toBe('telegram_.._.._etc_passwd.json');
    expect(path.dirname(f)).toBe(_internal.HISTORY_DIR);
  });
});
