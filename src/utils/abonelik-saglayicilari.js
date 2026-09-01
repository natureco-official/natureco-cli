'use strict';

/**
 * abonelik-saglayicilari — abonelikle model kullanımını destekleyen CLI'lar.
 *
 * ORTAK İLKE: aboneliğe ait token'a HİÇ DOKUNULMAZ.
 *
 * Her sağlayıcının aboneliği, o firmanın kendi birinci taraf CLI'sine bağlıdır.
 * O token'ı alıp doğrudan HTTP isteği atmak iki sorun doğurur: (1) uçların
 * önündeki koruma katmanları yalnızca birinci taraf istemcileri geçirdiği için
 * araç, o istemci gibi görünmek zorunda kalır — yani kimlik taklidi; (2) bu
 * CLI'ların refresh token'ları çoğunlukla tek kullanımlıktır, paylaşılınca her
 * iki oturum da bozulur.
 *
 * Bu yüzden yaklaşım her sağlayıcıda aynı: firmanın KENDİ CLI'sini alt süreç
 * olarak çalıştır, ona kendi adımızla tanıt, sonucu oku. Taklit yok, token'a
 * dokunulmuyor, kullanıcının mevcut oturumu aynen kullanılıyor.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

/** Bir CLI PATH'te var mı (ve sürümü ne). */
function komutVar(komut, calistir = execSync) {
  try {
    const cikti = calistir(`${komut} --version`, { stdio: 'pipe', timeout: 10000, encoding: 'utf8' });
    return { var: true, surum: String(cikti || '').trim().split('\n')[0] };
  } catch {
    return { var: false, surum: null };
  }
}

function jsonOku(dosya) {
  try { return JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch { return null; }
}

/** Saniye ya da milisaniye olabilen zaman damgasını ms'ye çevirir. */
function msyeCevir(deger) {
  const n = Number(deger);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? n : n * 1000;
}

const SAGLAYICILAR = {
  /**
   * OpenAI Codex CLI — ChatGPT Plus/Pro aboneliği.
   * `codex app-server` JSON-RPC arayüzü sunar (bkz. codex-subscription.js).
   */
  codex: {
    ad: 'ChatGPT (OpenAI)',
    komut: 'codex',
    kurulum: 'npm i -g @openai/codex',
    giris: 'codex login',
    arayuz: 'app-server (JSON-RPC)',
    durum(calistir) {
      const k = komutVar('codex', calistir);
      if (!k.var) return { kullanilabilir: false, sebep: 'codex CLI kurulu değil', surum: null };

      const dosya = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
      if (!fs.existsSync(dosya)) {
        return { kullanilabilir: false, sebep: 'oturum açılmamış', surum: k.surum };
      }
      const auth = jsonOku(dosya);
      if (!auth) return { kullanilabilir: false, sebep: 'auth.json okunamadı', surum: k.surum };
      if (auth.auth_mode !== 'chatgpt') {
        return {
          kullanilabilir: false,
          sebep: `API anahtarı kipinde (auth_mode=${auth.auth_mode})`,
          surum: k.surum,
        };
      }
      return { kullanilabilir: true, sebep: '', surum: k.surum, plan: null };
    },
  },

  /**
   * Anthropic Claude Code — Claude Pro/Max aboneliği.
   * `claude -p --output-format stream-json` yapılandırılmış akış verir.
   */
  claude: {
    ad: 'Claude (Anthropic)',
    komut: 'claude',
    kurulum: 'npm i -g @anthropic-ai/claude-code',
    giris: 'claude login',
    arayuz: 'stream-json (headless)',
    durum(calistir) {
      const k = komutVar('claude', calistir);
      if (!k.var) return { kullanilabilir: false, sebep: 'claude CLI kurulu değil', surum: null };

      const dosya = path.join(os.homedir(), '.claude', '.credentials.json');
      if (!fs.existsSync(dosya)) {
        return { kullanilabilir: false, sebep: 'oturum açılmamış', surum: k.surum };
      }
      const cred = jsonOku(dosya);
      const o = cred && cred.claudeAiOauth;
      if (!o) return { kullanilabilir: false, sebep: 'abonelik oturumu bulunamadı', surum: k.surum };

      // SÜRE KONTROLÜ ŞART. Dosyanın varlığı oturumun geçerli olduğu anlamına
      // gelmez: ölçülen bir makinede dosya duruyordu ama erişim token'ı
      // expiresAt=0 ve yenileme token'ı da dolmuştu; CLI çağrısı
      // "OAuth session expired and could not be refreshed" ile başarısız oluyordu.
      // Bunu önceden söylemek, kullanıcıyı başarısız bir çağrıya göndermekten iyidir.
      const erisimSonu = msyeCevir(o.expiresAt);
      const yenilemeSonu = msyeCevir(o.refreshTokenExpiresAt);
      const simdi = Date.now();
      if (yenilemeSonu && yenilemeSonu <= simdi) {
        return { kullanilabilir: false, sebep: 'oturum süresi dolmuş, yeniden giriş gerekli', surum: k.surum };
      }
      if (!erisimSonu && !yenilemeSonu) {
        return { kullanilabilir: false, sebep: 'oturum süresi okunamadı, yeniden giriş gerekli', surum: k.surum };
      }
      if (!erisimSonu || erisimSonu <= simdi) {
        // Erişim token'ı dolmuş ama yenileme hâlâ geçerli: CLI kendi yeniler.
        if (yenilemeSonu && yenilemeSonu > simdi) {
          return { kullanilabilir: true, sebep: '', surum: k.surum, plan: o.subscriptionType || null, yenilemeGerek: true };
        }
        return { kullanilabilir: false, sebep: 'oturum süresi dolmuş, yeniden giriş gerekli', surum: k.surum };
      }
      return { kullanilabilir: true, sebep: '', surum: k.surum, plan: o.subscriptionType || null };
    },
  },
};

/** Tüm sağlayıcıların durumunu döndürür. Ağ çağrısı YAPMAZ. */
function tumDurumlar(calistir) {
  const sonuc = {};
  for (const [anahtar, s] of Object.entries(SAGLAYICILAR)) {
    let d;
    try { d = s.durum(calistir); }
    catch (e) { d = { kullanilabilir: false, sebep: `durum okunamadı: ${e.message}`, surum: null }; }
    sonuc[anahtar] = { anahtar, ad: s.ad, komut: s.komut, kurulum: s.kurulum, giris: s.giris, arayuz: s.arayuz, ...d };
  }
  return sonuc;
}

/** Kullanılabilir olanların anahtarları. */
function kullanilabilirler(calistir) {
  return Object.values(tumDurumlar(calistir)).filter(d => d.kullanilabilir).map(d => d.anahtar);
}

module.exports = { SAGLAYICILAR, tumDurumlar, kullanilabilirler, komutVar, msyeCevir };
