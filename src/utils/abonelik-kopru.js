'use strict';

/**
 * abonelik-kopru — aboneliği OpenAI-uyumlu YEREL bir uç olarak sunar.
 *
 * NEDEN KÖPRÜ, NEDEN REPL'İ DEĞİŞTİRMEDİK:
 * Sohbet döngüsü (src/commands/repl.js) baştan sona `providerUrl` +
 * `/chat/completions` üzerine kurulu: akış ayrıştırma, araç çağrıları, yedek
 * sağlayıcı zinciri, token muhasebesi, sıkıştırma. Aboneliği alt süreç olarak
 * o döngünün içine sokmak, en riskli ve en çok test edilmiş dosyayı yeniden
 * yazmak demekti. Bunun yerine dönüşümü SINIRA koyduk: köprü OpenAI protokolü
 * konuşur, arkada `codex app-server` ile JSON-RPC yapar. Böylece REPL'de tek
 * satır değişmeden akış, yedekleme ve muhasebe olduğu gibi çalışır.
 *
 * GÜVENLİK — yerel uç neden anahtar ister:
 * Bu uç, kullanıcının PARALI aboneliğini konuşturur. Anahtarsız açık bir yerel
 * port, makinedeki her süreç (ve tarayıcıdaki her sayfa) için bedava kota
 * demektir. Bu yüzden: yalnız 127.0.0.1'e bağlanır, her açılışta rastgele bir
 * anahtar üretir, sabit zamanlı karşılaştırmayla doğrular ve Origin başlığı
 * taşıyan istekleri (yani tarayıcıdan geleni) reddeder.
 *
 * Protokol alanları `codex app-server generate-json-schema` çıktısından
 * doğrulandı; olay adları canlı ölçümle teyit edildi (bkz. test dosyası).
 */

const http = require('http');
const crypto = require('crypto');
const { CodexAbonelikIstemcisi } = require('./codex-subscription');

/** Tur tamamlanmazsa istek sonsuza kadar asılı kalmasın. */
const TUR_ZAMAN_ASIMI_MS = 300000;

/** Yeniden kullanılacak konuşma sayısı üst sınırı — sınırsız büyümeyi önler. */
const EN_FAZLA_KONUSMA = 32;

/**
 * app-server sürecine geçilen İKİNCİ katman koruma.
 *
 * Asıl güvence konuşma açılışındaki `sandbox: 'read-only'` (bkz. _konusmaAc);
 * bu argüman onun yedeği. İkisi de aynı şeyi söylediği için birbirini bozmaz.
 */
const KORUMA_ARGUMANLARI = ['-c', 'sandbox_mode="read-only"'];

function sabitZamanliEsit(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/** Mesaj dizisinin kimliği — aynı konuşmanın devamını tanımak için. */
function parmakIzi(mesajlar) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(mesajlar.map(m => [m.role, typeof m.content === 'string' ? m.content : JSON.stringify(m.content)])))
    .digest('hex');
}

function metneCevir(icerik) {
  if (typeof icerik === 'string') return icerik;
  if (Array.isArray(icerik)) {
    return icerik.map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n');
  }
  return icerik == null ? '' : String(icerik);
}

/** Rol yapısını tek metne indirger — app-server girdisi yalnızca kullanıcı rolü taşır. */
function konusmayiDuzlestir(mesajlar) {
  return mesajlar.map(m => {
    const t = metneCevir(m.content);
    if (!t) return '';
    if (m.role === 'assistant') return `[asistan]\n${t}`;
    if (m.role === 'tool') return `[araç sonucu]\n${t}`;
    return t;
  }).filter(Boolean).join('\n\n');
}

/** app-server'ın token dökümünü OpenAI `usage` alanına çevirir. */
function kullanimCevir(d) {
  if (!d || !Number.isFinite(d.inputTokens)) return null;
  return {
    prompt_tokens: Number(d.inputTokens || 0),
    completion_tokens: Number(d.outputTokens || 0),
    total_tokens: Number(d.totalTokens ?? (d.inputTokens || 0) + (d.outputTokens || 0)),
    prompt_tokens_details: { cached_tokens: Number(d.cachedInputTokens || 0) },
    completion_tokens_details: { reasoning_tokens: Number(d.reasoningOutputTokens || 0) },
  };
}

class AbonelikKoprusu {
  constructor(opts = {}) {
    this.surum = opts.surum || 'bilinmiyor';
    this.komut = opts.komut || 'codex';
    this.anahtar = opts.anahtar || crypto.randomBytes(24).toString('hex');
    this.sunucu = null;
    this.istemci = null;
    this._verilenIstemci = opts.istemci || null;
    this.port = null;
    /** parmakİzi -> threadId; aynı konuşmanın devamında geçmiş tekrar gönderilmez. */
    this.konusmalar = new Map();
    /** threadId -> olay dinleyicisi; her tur kendi olaylarını alır. */
    this._dinleyiciler = new Map();
    /** Uçuştaki turların bitiricileri; kapatmada hepsi iptal edilir. */
    this._iptaller = new Set();
  }

  get url() { return `http://127.0.0.1:${this.port}/v1`; }

  async baslat() {
    // opts.istemci: testlerde gerçek abonelik olmadan protokolü sürebilmek için.
    this.istemci = this._verilenIstemci
      || new CodexAbonelikIstemcisi({
        surum: this.surum,
        komut: this.komut,
        ekArgumanlar: KORUMA_ARGUMANLARI,
      });
    this.istemci.bildirimDinleyici = (m, p) => this._bildirim(m, p);
    await this.istemci.baslat();

    this.sunucu = http.createServer((istek, yanit) => this._istek(istek, yanit));
    await new Promise((coz, ret) => {
      this.sunucu.once('error', ret);
      // YALNIZ 127.0.0.1. '0.0.0.0' aboneliği ağdaki herkese açardı.
      this.sunucu.listen(0, '127.0.0.1', coz);
    });
    this.port = this.sunucu.address().port;
    return { url: this.url, anahtar: this.anahtar, port: this.port };
  }

  /**
   * Olayları İLGİLİ tura dağıtır.
   *
   * TEK DİNLEYİCİ YETMEZ. Tek bir `_aktif` alanı tutulduğunda ikinci bir istek
   * başlayınca birincinin dinleyicisi sessizce siliniyor; birinci tur bir daha
   * hiçbir olay almadığı için zaman aşımına kadar asılı kalıyordu. Her tur kendi
   * konuşmasında çalıştığı için doğru anahtar threadId.
   */
  _bildirim(metot, params) {
    const id = params && params.threadId;
    const d = id ? this._dinleyiciler.get(id) : null;
    if (d) d(metot, params);
  }

  _istek(istek, yanit) {
    // Tarayıcıdan gelen istekleri reddet: yerel uç, sayfaların erişimine açılmamalı.
    if (istek.headers.origin) return this._hata(yanit, 403, 'tarayıcı kaynaklı isteklere kapalı');

    const yetki = String(istek.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!sabitZamanliEsit(yetki, this.anahtar)) return this._hata(yanit, 401, 'geçersiz anahtar');

    const yol = String(istek.url || '').split('?')[0].replace(/\/+$/, '');
    if (istek.method === 'GET' && /\/models$/.test(yol)) return this._modeller(yanit);
    if (istek.method !== 'POST' || !/\/chat\/completions$/.test(yol)) {
      return this._hata(yanit, 404, 'bilinmeyen uç');
    }

    let govde = '';
    istek.on('data', d => {
      govde += d;
      if (govde.length > 40 * 1024 * 1024) { istek.destroy(); }
    });
    istek.on('end', () => {
      let j;
      try { j = JSON.parse(govde); } catch { return this._hata(yanit, 400, 'gövde JSON değil'); }
      this._sohbet(j, yanit).catch(e => this._hata(yanit, 500, e.message));
    });
  }

  /** Abonelikteki model adları; bir kez alınır. Alınamazsa doğrulama atlanır. */
  async _gecerliModeller() {
    if (this._modelAdlari) return this._modelAdlari;
    try {
      const r = await this.istemci.modeller();
      const ms = (r?.models || r?.data || []).map(m => m.id || m.slug || m.name).filter(Boolean);
      this._modelAdlari = ms;
    } catch {
      // Liste alınamadıysa isteği engelleme; doğrulama bir kolaylık, kapı değil.
      this._modelAdlari = [];
    }
    return this._modelAdlari;
  }

  async _modeller(yanit) {
    try {
      const r = await this.istemci.modeller();
      const ms = (r?.models || r?.data || []).map(m => ({
        id: m.id || m.slug || m.name, object: 'model', owned_by: 'abonelik',
      }));
      this._json(yanit, 200, { object: 'list', data: ms });
    } catch (e) { this._hata(yanit, 502, e.message); }
  }

  async _sohbet(govde, yanit) {
    const mesajlar = Array.isArray(govde.messages) ? govde.messages : [];
    if (!mesajlar.length) return this._hata(yanit, 400, 'messages boş');

    // MODEL DOĞRULAMASI ŞART. Ölçüldü: abonelikte bulunmayan bir model adı
    // (ör. API kataloğundan gelen 'gpt-5.1-codex') hata ÜRETMİYOR — tur normal
    // tamamlanıyor ve yanıt boş dönüyor. Sessiz boşluk, kullanıcıya "model
    // cevap vermedi" gibi görünür; sebebini söylemek çok daha iyi.
    if (govde.model) {
      const gecerli = await this._gecerliModeller();
      if (gecerli.length && !gecerli.includes(govde.model)) {
        return this._hata(yanit, 400,
          `'${govde.model}' abonelikte yok. Kullanılabilir: ${gecerli.join(', ')}`);
      }
    }

    const sistem = mesajlar.filter(m => m.role === 'system').map(m => metneCevir(m.content)).join('\n\n');
    const kalan = mesajlar.filter(m => m.role !== 'system');
    const son = kalan[kalan.length - 1];

    // Aynı konuşmanın devamıysa yalnızca YENİ mesajı gönder; app-server kendi
    // geçmişini tutuyor, tüm geçmişi tekrar yollamak hem yavaş hem gereksiz.
    const oncekiIz = kalan.length > 1 ? parmakIzi(kalan.slice(0, -1)) : null;
    let threadId = oncekiIz ? this.konusmalar.get(oncekiIz) : null;
    let girdi;

    if (threadId) {
      girdi = metneCevir(son.content);
    } else {
      threadId = await this._konusmaAc(sistem, govde.model);
      girdi = konusmayiDuzlestir(kalan);
    }
    if (!girdi) girdi = '(boş)';

    const akis = govde.stream === true;
    const sonuc = await this._tur(threadId, girdi, govde, akis ? yanit : null);

    this._konusmaKaydet(kalan, sonuc.metin, threadId);

    if (akis) return; // akışta yanıt zaten yazıldı
    this._json(yanit, 200, this._openAiYanit(govde.model, sonuc));
  }

  async _konusmaAc(sistem, model) {
    const p = {
      // ephemeral: köprü konuşmaları kullanıcının kendi codex geçmişini kirletmemeli.
      ephemeral: true,
      // never: onay istemleri bu köprüde karşılıksız kalır ve turu asar; ayrıca
      // onay/koruma katmanı natureco tarafında, orada zaten uygulanıyor.
      approvalPolicy: 'never',
      // SALT OKUNUR — KÖPRÜNÜN ASIL GÜVENCESİ. Kaldırılmamalı.
      //
      // Arkadaki app-server düz bir model değil, kendi kabuk/dosya araçları olan
      // bir ajandır: köprüden "dosya oluştur" dendiğinde bunu gerçekten dener.
      // Ölçüldü — sürece `-c sandbox_mode="danger-full-access"` verilip bu alan
      // konmadığında dosya GERÇEKTEN oluştu; aynı süreç ayarıyla bu alan
      // konduğunda yazma engellendi. Yani belirleyici olan burası ve kullanıcının
      // kendi codex ayarı ne olursa olsun köprü salt okunur çalışır.
      //
      // Amaç: köprüde model, model olarak kalsın. Dosya/kabuk eylemleri
      // natureco'nun kendi araçlarından, kendi onay ve koruma katmanından geçer;
      // arkada ikinci bir özerk ajan sessizce iş yapmaz.
      sandbox: 'read-only',
    };
    if (sistem) p.developerInstructions = sistem;
    if (model) p.model = model;
    const t = await this.istemci.konusmaBaslat(p);
    const id = t?.thread?.id;
    if (!id) throw new Error('konuşma açılamadı');
    return id;
  }

  _konusmaKaydet(kalan, metin, threadId) {
    const iz = parmakIzi([...kalan, { role: 'assistant', content: metin }]);
    this.konusmalar.set(iz, threadId);
    while (this.konusmalar.size > EN_FAZLA_KONUSMA) {
      this.konusmalar.delete(this.konusmalar.keys().next().value);
    }
  }

  /** Turu çalıştırır; akış varsa SSE yazar. Döndürdüğü metin ve kullanım gerçektir. */
  _tur(threadId, girdi, govde, sseYanit) {
    return new Promise((coz, ret) => {
      let metin = '';
      let kullanim = null;
      let bittiMi = false;
      const kimlik = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;

      const zaman = setTimeout(() => bitir(new Error('abonelik turu zaman aşımına uğradı')), TUR_ZAMAN_ASIMI_MS);
      // Zamanlayıcı süreci AYAKTA TUTMAMALI: 5 dakikalık bir tur zaman aşımı,
      // iş bittikten sonra CLI'ın kapanmasını o kadar geciktirirdi.
      if (typeof zaman.unref === 'function') zaman.unref();

      const bitir = (hata) => {
        if (bittiMi) return;
        bittiMi = true;
        clearTimeout(zaman);
        this._dinleyiciler.delete(threadId);
        this._iptaller.delete(bitir);
        if (hata) return ret(hata);
        if (sseYanit) {
          this._sse(sseYanit, this._parca(kimlik, govde.model, {}, 'stop'));
          sseYanit.write('data: [DONE]\n\n');
          sseYanit.end();
        }
        coz({ metin, kullanim });
      };

      this._iptaller.add(bitir);
      this._dinleyiciler.set(threadId, (metot, p) => {
        if (metot === 'item/agentMessage/delta') {
          const d = p?.delta || '';
          if (!d) return;
          metin += d;
          if (sseYanit) this._sse(sseYanit, this._parca(kimlik, govde.model, { content: d }));
        } else if (metot === 'item/completed' && p?.item?.type === 'agentMessage') {
          // Delta kaçmışsa tam metin buradan gelir; akış geldiyse zaten eşit.
          if (p.item.text && p.item.text.length > metin.length) metin = p.item.text;
        } else if (metot === 'thread/tokenUsage/updated') {
          // GERÇEK sayım — tahmine (chars/4) düşmeye gerek yok.
          // `last` BU turun, `total` konuşmanın tamamının sayımı. OpenAI'ın
          // usage alanı istek başına olduğu için doğrusu `last`; `total`
          // kullanmak çok turlu sohbette tüketimi katlanarak şişirirdi.
          kullanim = kullanimCevir(p?.tokenUsage?.last) || kullanim;
        } else if (metot === 'turn/completed') {
          bitir(null);
        } else if (metot === 'turn/failed') {
          bitir(new Error(p?.error?.message || 'abonelik turu başarısız'));
        }
      });

      if (sseYanit) {
        sseYanit.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        this._sse(sseYanit, this._parca(kimlik, govde.model, { role: 'assistant', content: '' }));
      }

      const p = { threadId, input: [{ type: 'text', text: girdi }] };
      if (govde.model) p.model = govde.model;
      if (govde.reasoning_effort) p.effort = govde.reasoning_effort;

      this.istemci.turBaslat(p, TUR_ZAMAN_ASIMI_MS).catch(e => bitir(e));
    });
  }

  _parca(kimlik, model, delta, sebep = null) {
    return {
      id: kimlik, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000),
      model: model || 'abonelik',
      choices: [{ index: 0, delta, finish_reason: sebep }],
    };
  }

  _openAiYanit(model, { metin, kullanim }) {
    return {
      id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'abonelik',
      choices: [{ index: 0, message: { role: 'assistant', content: metin }, finish_reason: 'stop' }],
      ...(kullanim ? { usage: kullanim } : {}),
    };
  }

  _sse(yanit, nesne) {
    try { yanit.write(`data: ${JSON.stringify(nesne)}\n\n`); } catch { /* istemci kapatmış olabilir */ }
  }

  _json(yanit, kod, nesne) {
    if (yanit.headersSent || yanit.writableEnded) return false;
    const g = JSON.stringify(nesne);
    yanit.writeHead(kod, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(g) });
    yanit.end(g);
    return true;
  }

  /**
   * Hata bildirir.
   *
   * BAŞLIKLAR GİTTİYSE writeHead ÇAĞRILAMAZ. Akış başladıktan sonra oluşan bir
   * hatada (ör. tur yarıda başarısız) yeniden başlık yazmak
   * ERR_HTTP_HEADERS_SENT fırlatır ve bu, yakalanmadığı için TÜM SÜRECİ
   * çökertiyordu. Akış başlamışsa hata, akışın içinden bildirilir.
   */
  _hata(yanit, kod, mesaj) {
    if (this._json(yanit, kod, { error: { message: mesaj, type: 'abonelik_kopru' } })) return;
    if (yanit.writableEnded) return;
    this._sse(yanit, { error: { message: mesaj, type: 'abonelik_kopru' } });
    try { yanit.write('data: [DONE]\n\n'); yanit.end(); } catch { /* bağlantı zaten kopmuş olabilir */ }
  }

  /**
   * Köprüyü kapatır. İki kez çağrılabilir.
   *
   * AÇIK BAĞLANTILAR ZORLA KAPATILIR. Ölçüldü: `server.close()` yalnızca yeni
   * bağlantıyı reddeder, açık olanların bitmesini bekler — akış (SSE) bağlantısı
   * ise kendiliğinden bitmez. Yalnızca close() beklendiğinde kapatma, akış
   * sürerken SONSUZA KADAR asılı kalıyordu (180 sn'de dönmedi).
   */
  async kapat() {
    // Uçuştaki turları önce iptal et: yoksa hem istek sahipleri sonsuza kadar
    // bekler hem de tur zamanlayıcıları arkada asılı kalır.
    for (const iptal of [...this._iptaller]) {
      try { iptal(new Error('abonelik köprüsü kapatıldı')); } catch { /* iptal hatası kapanışı durdurmasın */ }
    }
    this._iptaller.clear();
    this._dinleyiciler.clear();

    const sunucu = this.sunucu;
    this.sunucu = null;
    if (sunucu) {
      const bitti = new Promise(r => sunucu.close(r));
      if (typeof sunucu.closeAllConnections === 'function') sunucu.closeAllConnections();
      await bitti;
    }
    if (this.istemci) { this.istemci.kapat(); this.istemci = null; }
  }
}

module.exports = { AbonelikKoprusu, parmakIzi, konusmayiDuzlestir, metneCevir, sabitZamanliEsit };
