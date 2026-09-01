/**
 * ChatGPT aboneliğiyle model kullanımı.
 *
 * TASARIM KARARI — neden alt süreç, neden doğrudan HTTP değil:
 *
 * Aboneliği kullanmanın iki yolu var. Doğrudan HTTP yolu
 * (chatgpt.com/backend-api/codex/responses) ucun önündeki Cloudflare katmanını
 * geçmek için `originator: codex_cli_rs` ve `User-Agent: codex_cli_rs/...`
 * göndermeyi, yani OpenAI'ın birinci taraf istemcisi gibi görünmeyi gerektiriyor.
 * Ayrıca tek kullanımlık refresh token'ı Codex CLI ile paylaşınca
 * `refresh_token_reused` ile her iki oturumu da bozuyor.
 *
 * Bu yüzden uygulanan yol, `codex app-server` alt sürecini çalıştırıp stdio
 * üzerinden JSON-RPC konuşmak: isteği OpenAI'ın KENDİ istemcisi atıyor, biz
 * ona kendi adımızla tanıtıyoruz. Taklit yok, token'a dokunulmuyor.
 *
 * Bu testler protokol katmanını gerçek süreç olmadan doğrular; canlı
 * doğrulama `codex` kurulu olduğunda ayrıca koşar.
 */
const { EventEmitter } = require('events');
const { CodexAbonelikIstemcisi, abonelikDurumu } = require('../../src/utils/codex-subscription');

/** Gerçek app-server'ın satır tabanlı protokolünü taklit eden sahte süreç. */
function sahteSurec(yanitla) {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  p.killed = false;
  p.kill = () => { p.killed = true; };
  p.stdin = {
    write: (satir) => {
      const istek = JSON.parse(satir);
      const cevap = yanitla(istek);
      if (cevap === undefined) return true;
      setImmediate(() => p.stdout.emit('data', Buffer.from(JSON.stringify(cevap) + '\n')));
      return true;
    },
  };
  return p;
}

function istemciKur(yanitla) {
  const c = new CodexAbonelikIstemcisi({ surum: 'test' });
  c.surec = sahteSurec(yanitla);
  c._baglan();
  return c;
}

const ok = (istek, result) => ({ jsonrpc: '2.0', id: istek.id, result });

describe('codex app-server protokolü', () => {
  test('istek/yanıt id ile eşleşir', async () => {
    const c = istemciKur(i => ok(i, { echo: i.method }));
    await expect(c.istek('account/read')).resolves.toEqual({ echo: 'account/read' });
    c.kapat();
  });

  test('eşzamanlı istekler karışmaz', async () => {
    const c = istemciKur(i => ok(i, { method: i.method }));
    const [a, b] = await Promise.all([c.istek('model/list'), c.istek('account/read')]);
    expect(a.method).toBe('model/list');
    expect(b.method).toBe('account/read');
    c.kapat();
  });

  test('sunucu hatası reddedilir', async () => {
    const c = istemciKur(i => ({ jsonrpc: '2.0', id: i.id, error: { message: 'unknown variant' } }));
    await expect(c.istek('yok')).rejects.toThrow(/unknown variant/);
    c.kapat();
  });

  test('bildirimler dinleyiciye gider, istek olarak sayılmaz', async () => {
    const gelenler = [];
    const c = new CodexAbonelikIstemcisi({ onBildirim: (m, p) => gelenler.push([m, p]) });
    c.surec = sahteSurec(() => undefined);
    c.surec.stdout.on('data', (d) => c._veriGeldi(d));
    c.surec.stdout.emit('data', Buffer.from(
      JSON.stringify({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: 't1' } } }) + '\n'));
    await new Promise(r => setImmediate(r));
    expect(gelenler).toHaveLength(1);
    expect(gelenler[0][0]).toBe('thread/started');
    c.kapat();
  });

  test('parçalı gelen satırlar birleştirilir', async () => {
    const c = new CodexAbonelikIstemcisi();
    c.surec = sahteSurec(() => undefined);
    const sozler = [];
    c.bildirimDinleyici = (m) => sozler.push(m);
    const tam = JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: {} }) + '\n';
    c._veriGeldi(Buffer.from(tam.slice(0, 12)));
    c._veriGeldi(Buffer.from(tam.slice(12)));
    expect(sozler).toEqual(['turn/completed']);
    c.kapat();
  });

  test('tek okumada gelen iki mesaj ayrı ayrı işlenir', async () => {
    const c = new CodexAbonelikIstemcisi();
    c.surec = sahteSurec(() => undefined);
    const sozler = [];
    c.bildirimDinleyici = (m) => sozler.push(m);
    c._veriGeldi(Buffer.from(
      JSON.stringify({ jsonrpc: '2.0', method: 'a', params: {} }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', method: 'b', params: {} }) + '\n'));
    expect(sozler).toEqual(['a', 'b']);
    c.kapat();
  });

  test('bozuk JSON akışı bozmaz', async () => {
    const c = new CodexAbonelikIstemcisi();
    c.surec = sahteSurec(() => undefined);
    const sozler = [];
    c.bildirimDinleyici = (m) => sozler.push(m);
    c._veriGeldi(Buffer.from('{bozuk\n' + JSON.stringify({ jsonrpc: '2.0', method: 'saglam', params: {} }) + '\n'));
    expect(sozler).toEqual(['saglam']);
    c.kapat();
  });

  test('süreç kapanınca bekleyen istekler reddedilir (asılı kalmaz)', async () => {
    const c = istemciKur(() => undefined);
    const p = c.istek('turn/start', {}, 60000);
    c.surec.emit('exit', 1);
    await expect(p).rejects.toThrow(/kapandı/);
  });

  test('kapatıldıktan sonra istek reddedilir', async () => {
    const c = istemciKur(i => ok(i, {}));
    c.kapat();
    await expect(c.istek('account/read')).rejects.toThrow(/kapalı/);
  });

  test('zaman aşımı isteği asılı bırakmaz', async () => {
    const c = istemciKur(() => undefined);
    await expect(c.istek('turn/start', {}, 50)).rejects.toThrow(/yanıt vermedi/);
    c.kapat();
  });

  test('kendi adımızla tanıtılır — taklit yok', async () => {
    let gonderilen = null;
    const c = new CodexAbonelikIstemcisi({ surum: '9.9.9' });
    c.surec = sahteSurec(i => { if (i.method === 'initialize') gonderilen = i.params; return ok(i, {}); });
    c.surec.stdout.on('data', (d) => c._veriGeldi(d));
    await c.istek('initialize', { clientInfo: { name: 'natureco-cli', title: 'NatureCo CLI', version: '9.9.9' } });
    expect(gonderilen.clientInfo.name).toBe('natureco-cli');
    // Codex CLI kimliği taklit EDİLMEMELİ.
    expect(JSON.stringify(gonderilen)).not.toMatch(/codex_cli_rs/);
    c.kapat();
  });
});

describe('abonelik durumu tespiti', () => {
  test('codex yoksa kullanılabilir değil ve sebep açık', () => {
    const d = abonelikDurumu({ execSync: () => { throw new Error('not found'); } });
    expect(d.kullanilabilir).toBe(false);
    expect(d.codexVar).toBe(false);
    expect(d.sebep).toMatch(/codex CLI bulunamadı/);
  });

  test('gerçek makinede tutarlı sonuç döner', () => {
    const d = abonelikDurumu();
    expect(typeof d.kullanilabilir).toBe('boolean');
    // Kullanılabilir değilse mutlaka bir sebep verilmeli — sessiz başarısızlık yok.
    if (!d.kullanilabilir) expect(d.sebep).toBeTruthy();
    else expect(d.oturumAcik).toBe(true);
  });
});
