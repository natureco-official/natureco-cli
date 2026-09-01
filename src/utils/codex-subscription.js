'use strict';

/**
 * codex-subscription — ChatGPT aboneliğiyle model kullanımı.
 *
 * Kullanıcı ChatGPT Plus/Pro aboneliğine sahipse, API anahtarı ödemeden model
 * çalıştırabilir. Bunu yapmanın İKİ yolu var ve aralarındaki fark önemli:
 *
 *   (A) DOĞRUDAN HTTP — https://chatgpt.com/backend-api/codex/responses ucuna
 *       kendi OAuth token'ımızla istek atmak. Bu ucun önündeki Cloudflare
 *       katmanı yalnızca OpenAI'ın BİRİNCİ TARAF istemcilerini geçiriyor;
 *       üçüncü taraf bir aracın geçebilmesi için `originator: codex_cli_rs` ve
 *       `User-Agent: codex_cli_rs/...` göndererek Codex CLI gibi görünmesi
 *       gerekiyor. Yani mekanizmanın çekirdeği kimlik taklidi.
 *
 *       BU YOL BİLİNÇLİ OLARAK UYGULANMADI. Kullanıcının ChatGPT hesabını
 *       riske atar ve tek kullanımlık refresh token'ı Codex CLI ile paylaşınca
 *       `refresh_token_reused` ile her iki oturumu da bozar.
 *
 *   (B) CODEX CLI ALT SÜRECİ — `codex app-server` çalıştırıp stdio üzerinden
 *       JSON-RPC konuşmak. Burada isteği OpenAI'ın KENDİ birinci taraf
 *       istemcisi atıyor; biz yalnızca ona kendi adımızla tanıtıyoruz
 *       (initialize yanıtındaki userAgent bizim adımızı taşıyor). Taklit yok,
 *       token'a hiç dokunmuyoruz, kullanıcının mevcut `codex login` oturumu
 *       aynen kullanılıyor.
 *
 * Uygulanan yol (B). Gereksinim: `codex` PATH'te ve `codex login` yapılmış.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const AUTH_FILE = path.join(CODEX_HOME, 'auth.json');

/** app-server'ın ilk yanıtı için üst sınır; yoksa CLI kurulu değil sayılır. */
const BASLANGIC_ZAMAN_ASIMI_MS = 20000;

/**
 * ChatGPT aboneliği bu makinede kullanılabilir mi?
 * Ağ çağrısı YAPMAZ; yalnızca yerel duruma bakar.
 */
function abonelikDurumu({ execSync } = {}) {
  const sonuc = { kullanilabilir: false, sebep: '', codexVar: false, oturumAcik: false };

  try {
    const calistir = execSync || require('child_process').execSync;
    calistir('codex --version', { stdio: 'pipe', timeout: 10000 });
    sonuc.codexVar = true;
  } catch {
    sonuc.sebep = 'codex CLI bulunamadı (npm i -g @openai/codex)';
    return sonuc;
  }

  if (!fs.existsSync(AUTH_FILE)) {
    sonuc.sebep = 'codex oturumu açılmamış (codex login)';
    return sonuc;
  }
  let auth;
  try { auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); }
  catch { sonuc.sebep = 'codex auth.json okunamadı'; return sonuc; }

  if (auth.auth_mode !== 'chatgpt') {
    sonuc.sebep = `codex API anahtarı kipinde (auth_mode=${auth.auth_mode}); abonelik için: codex login`;
    return sonuc;
  }
  sonuc.oturumAcik = true;
  sonuc.kullanilabilir = true;
  return sonuc;
}

/**
 * `codex app-server` ile JSON-RPC konuşan ince istemci.
 *
 * Satır tabanlı protokol: her mesaj tek satır JSON. İstekler `id` taşır,
 * bildirimler taşımaz.
 */
class CodexAbonelikIstemcisi {
  constructor(opts = {}) {
    this.surec = null;
    this.tampon = '';
    this.sonrakiId = 0;
    this.bekleyen = new Map();
    this.bildirimDinleyici = opts.onBildirim || (() => {});
    /** Sunucudan gelen istekleri karşılar; undefined dönerse "desteklenmiyor" yanıtı gider. */
    this.istekIsleyici = opts.onIstek || null;
    this.komut = opts.komut || 'codex';
    /** app-server'a eklenecek argümanlar (ör. -c ile ayar geçersiz kılma). */
    this.ekArgumanlar = opts.ekArgumanlar || [];
    this.surum = opts.surum || 'bilinmiyor';
    this.kapandi = false;
  }

  async baslat() {
    if (this.surec) return;
    this.surec = spawn(this.komut, ['app-server', ...(this.ekArgumanlar || [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    this._baglan();

    // İlk el sıkışma. Kendi adımızla tanıtıyoruz — taklit değil.
    await this.istek('initialize', {
      clientInfo: { name: 'natureco-cli', title: 'NatureCo CLI', version: this.surum },
    }, BASLANGIC_ZAMAN_ASIMI_MS);
  }

  /**
   * Süreç olaylarını bağlar. Ayrı metot: alt süreç ölürse bekleyen istekler
   * ZAMAN AŞIMINA KADAR ASILI KALMAMALI, hemen reddedilmeli.
   */
  _baglan() {
    this.surec.on('error', (e) => this._hepsiniReddet(new Error(`codex app-server başlatılamadı: ${e.message}`)));
    this.surec.on('exit', (kod) => {
      this.kapandi = true;
      this._hepsiniReddet(new Error(`codex app-server beklenmedik şekilde kapandı (kod ${kod})`));
    });
    this.surec.stdout.on('data', (d) => this._veriGeldi(d));
  }

  _veriGeldi(d) {
    this.tampon += d.toString();
    let i;
    while ((i = this.tampon.indexOf('\n')) >= 0) {
      const satir = this.tampon.slice(0, i).trim();
      this.tampon = this.tampon.slice(i + 1);
      if (!satir) continue;
      let m;
      try { m = JSON.parse(satir); } catch { continue; }

      // AYIRIM SIRASI ÖNEMLİ. İki taraf da id'lerini BAĞIMSIZ numaralandırır,
      // yani sunucunun bize sorduğu isteğin id'si bizim bekleyen bir isteğimizle
      // çakışabilir. JSON-RPC'de ayırt edici alan id değil `method`: yanıtlarda
      // method hiç bulunmaz. Önce ona bakmazsak sunucunun isteğini kendi
      // yanıtımız sanıp yanlış sözü çözeriz.
      if (m.method !== undefined) {
        if (m.id !== undefined) this._sunucuIstegi(m);
        else {
          try { this.bildirimDinleyici(m.method, m.params); } catch { /* dinleyici hatası akışı bozmasın */ }
        }
      } else if (m.id !== undefined && this.bekleyen.has(m.id)) {
        const { cozumle, reddet, zaman } = this.bekleyen.get(m.id);
        this.bekleyen.delete(m.id);
        clearTimeout(zaman);
        if (m.error) reddet(new Error(m.error.message || 'codex app-server hatası'));
        else cozumle(m.result);
      }
    }
  }

  /**
   * Sunucudan gelen isteği yanıtlar. YANITSIZ BIRAKILAMAZ: app-server bu
   * isteklerde bloke olur, tur asılı kalır. Bilmediğimiz bir metot gelirse bile
   * sessiz kalmak yerine JSON-RPC "method not found" döneriz.
   */
  _sunucuIstegi(m) {
    const gonder = (govde) => {
      if (this.kapandi || !this.surec) return;
      try { this.surec.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, ...govde }) + '\n'); }
      catch { /* süreç ölmüşse yazamayız, zaten reddedilecek */ }
    };
    let sonuc;
    try {
      sonuc = this.istekIsleyici ? this.istekIsleyici(m.method, m.params) : undefined;
    } catch (e) {
      gonder({ error: { code: -32603, message: e.message } });
      return;
    }
    if (sonuc === undefined) {
      gonder({ error: { code: -32601, message: `natureco-cli bu isteği karşılamıyor: ${m.method}` } });
      return;
    }
    Promise.resolve(sonuc).then(
      r => gonder({ result: r }),
      e => gonder({ error: { code: -32603, message: e.message } }),
    );
  }

  _hepsiniReddet(hata) {
    for (const [, b] of this.bekleyen) { clearTimeout(b.zaman); b.reddet(hata); }
    this.bekleyen.clear();
  }

  istek(method, params = {}, zamanAsimiMs = 120000) {
    if (this.kapandi) return Promise.reject(new Error('codex app-server kapalı'));
    return new Promise((cozumle, reddet) => {
      const id = ++this.sonrakiId;
      const zaman = setTimeout(() => {
        this.bekleyen.delete(id);
        reddet(new Error(`codex app-server yanıt vermedi: ${method}`));
      }, zamanAsimiMs);
      this.bekleyen.set(id, { cozumle, reddet, zaman });
      this.surec.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  /** Hesap ve plan bilgisi. E-posta gibi alanlar çağırana ait, loglanmamalı. */
  hesap() { return this.istek('account/read', {}); }

  /** Abonelikte kullanılabilir modeller (API kataloğundan FARKLI olabilir). */
  modeller() { return this.istek('model/list', {}); }

  /** Kota durumu: yüzde ve sıfırlanma zamanı. */
  kotalar() { return this.istek('account/rateLimits/read', {}); }

  konusmaBaslat(params = {}) { return this.istek('thread/start', params); }

  turBaslat(params) { return this.istek('turn/start', params); }

  turKes(params) { return this.istek('turn/interrupt', params); }

  kapat() {
    this.kapandi = true;
    this._hepsiniReddet(new Error('istemci kapatıldı'));
    if (this.surec) { try { this.surec.kill(); } catch { /* zaten ölmüş olabilir */ } }
    this.surec = null;
  }
}

module.exports = {
  abonelikDurumu,
  CodexAbonelikIstemcisi,
  CODEX_HOME,
  AUTH_FILE,
};
