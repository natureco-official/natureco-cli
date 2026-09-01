'use strict';

/**
 * self-improve — konuşmadan öğrenen, kendi skill'lerini damıtan döngünün çekirdeği.
 *
 * Tasarım Hermes'in tur-sonrası "background review" mekanizmasını temel alıyor
 * (ölçüldü: sayaç tetikli, yanıt teslim edildikten SONRA forklanan ajan, yalnız
 * bellek+skill araçlarına kısıtlı). Ama Hermes'in ölçülen üç zayıflığı burada
 * kapatılıyor:
 *
 *   1. İÇERİK DOĞRULAMASI. Hermes'te `guard_agent_created` varsayılan kapalı;
 *      otonom yazılan skill hiçbir içerik denetiminden geçmiyor. Burada
 *      degerlendirOneri() zorunlu.
 *
 *   2. KONSOLİDASYON. Hermes'te LLM birleştirme paso'su 7 koşunun hiçbirinde
 *      çalışmadı: 149 skill, 69'u bayat, 0 arşiv. Kütüphane şişiyor. Burada
 *      benzerlik eşiği aşıldığında yeni skill YARATILMIYOR, mevcut olan
 *      yamalanıyor.
 *
 *   3. GÜVENLİK SİNYALİ AYRIMI — asıl fark bu. Hermes'in kendi makinesinde
 *      ölçüldü: aynı döngü hem savunmacı bir korkuluk dosyası yazmış, hem de
 *      hafızasına sınır hatırlatmalarını AZALTMASINI söyleyen notlar. Çünkü
 *      prompt "kullanıcı memnuniyetsizliği birinci sınıf skill sinyalidir"
 *      diyor ve kullanıcının bir GÜVENLİK davranışından duyduğu
 *      memnuniyetsizlik de bu sinyale giriyor. Kod tarafında ayıran filtre yok.
 *
 *      Kendini geliştiren bir ajanın kendi korkuluklarını aşındırması,
 *      öğrenme döngüsünün en tehlikeli başarısızlık kipidir. guvenlikSinyaliMi()
 *      bu sinyalleri öğrenmeye KAPATIR.
 */

/**
 * İki parçalı eşleşme: bir GÜVENLİK KAVRAMI + bir ZAYIFLATMA EYLEMİ.
 *
 * Bitişiklik aranmıyor, çünkü kelime sırası dile ve cümleye göre değişir
 * ("stop asking for permission" ↔ "izin isteme"). Ayrıca JS'in `\w` sınıfı
 * Türkçe harfleri (ı, ş, ğ, ç, ö, ü) KAPSAMAZ — `\w*` ile ek soymaya çalışmak
 * "kısıtlamayı" gibi kelimelerde sessizce başarısız olur. Bu yüzden kökler
 * doğrudan aranıyor.
 */
const GUVENLIK_KAVRAMLARI = [
  'onay', 'izin', 'approval', 'permission', 'permissions',
  'kısıt', 'kisit', 'sınır', 'sinir', 'korkuluk', 'guardrail', 'guardrails',
  'restriction', 'restrictions', 'safeguard',
  'doğrulama', 'dogrulama', 'validation', 'verify', 'verification',
  'güvenlik', 'guvenlik', 'security', 'safety',
  'reddet', 'refuse', 'refusal',
  'tehlikeli komut', 'dangerous command',
  'onay iste', 'ask for permission', 'asking for permission',
];

const ZAYIFLATMA_EYLEMLERI = [
  // Doğrudan gevşetme talebi
  'kaldır', 'kaldir', 'gevşet', 'gevset', 'azalt', 'kapat', 'atla', 'yapma',
  'isteme', 'sorma', 'bırak', 'birak', 'devre dışı', 'devre disi',
  'remove', 'relax', 'loosen', 'disable', 'skip', 'bypass', 'turn off',
  'stop asking', "don't ask", 'dont ask', "don't refuse", 'stop', 'ignore',
  // Şikâyet biçimi: davranışın kendisi fazla/gereksiz bulunuyor. Talep örtük
  // ama sonucu aynı — bundan öğrenmek korkuluğu aşındırır.
  'agresif', 'aggressive', 'çok fazla', 'cok fazla', 'too many', 'too much',
  'gereksiz', 'unnecessary', 'abartı', 'abarti', 'overkill', 'annoying',
  'rahatsız edici', 'rahatsiz edici',
];

/** Sık görülen, tek başına yeterli kalıplar. */
const GUVENLIK_KALIPLARI = [
  /\bsürekli\s+(onay|izin)/i,
  /\bher\s+seferinde\s+(onay|izin|sor)/i,
  /\byolo\s*mod/i,
  /\bfull\s*(access|yetki)\b/i,
];

/** Türkçe harfleri de kapsayan güvenli küçük harfe çevirme. */
function kucult(s) {
  return String(s || '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase();
}

/**
 * Bu sinyal, ajanın kendi güvenlik davranışına yönelik bir şikâyet mi?
 *
 * TRUE dönerse bundan skill/hafıza ÖĞRENİLMEZ. Kullanıcı bir korkuluktan
 * rahatsız olabilir ve bu meşru bir geri bildirimdir — ama çözümü ajanın
 * kendi kısıtını sessizce gevşetmesi değil, kullanıcının politikayı AÇIKÇA
 * değiştirmesidir (`natureco approvals`, `natureco config`).
 */
function guvenlikSinyaliMi(metin) {
  const ham = String(metin || '');
  if (!ham.trim()) return false;
  if (GUVENLIK_KALIPLARI.some(k => k.test(ham))) return true;

  const s = kucult(ham);
  const kavramVar = GUVENLIK_KAVRAMLARI.some(k => s.includes(kucult(k)));
  if (!kavramVar) return false;
  return ZAYIFLATMA_EYLEMLERI.some(e => s.includes(kucult(e)));
}

/**
 * Tetikleyici durumu.
 *
 * Cron değil: sayaç tabanlı ve yanıt kullanıcıya TESLİM EDİLDİKTEN sonra
 * çalışır. Böylece inceleme kullanıcıyı bekletmez.
 */
function yeniDurum(opts = {}) {
  return {
    aracTuruSayaci: 0,
    kullaniciTuruSayaci: 0,
    skillAraligi: Number.isFinite(opts.skillAraligi) ? opts.skillAraligi : 15,
    bellekAraligi: Number.isFinite(opts.bellekAraligi) ? opts.bellekAraligi : 10,
    // Fork edilen inceleyicide bu bayrak açıktır ve tetikleyici HİÇ çalışmaz.
    // Özyineleme engeli: inceleme kendi incelemesini başlatamaz.
    inceleyiciMi: !!opts.inceleyiciMi,
  };
}

function aracTuruIsle(durum) {
  if (!durum.inceleyiciMi) durum.aracTuruSayaci += 1;
  return durum;
}

function kullaniciTuruIsle(durum) {
  if (!durum.inceleyiciMi) durum.kullaniciTuruSayaci += 1;
  return durum;
}

/** Ajan skill'i kendi güncellediyse sayaç sıfırlanır. */
function skillGuncellendi(durum) {
  durum.aracTuruSayaci = 0;
  return durum;
}

/** Şimdi inceleme yapılmalı mı, ve neyin incelemesi? */
function incelemeGerekli(durum) {
  if (durum.inceleyiciMi) return { skill: false, bellek: false, gerekli: false };
  const skill = durum.skillAraligi > 0 && durum.aracTuruSayaci >= durum.skillAraligi;
  const bellek = durum.bellekAraligi > 0 && durum.kullaniciTuruSayaci >= durum.bellekAraligi;
  return { skill, bellek, gerekli: skill || bellek };
}

function incelemeTamamlandi(durum, { skill, bellek } = {}) {
  if (skill) durum.aracTuruSayaci = 0;
  if (bellek) durum.kullaniciTuruSayaci = 0;
  return durum;
}

// ── Öneri değerlendirme ───────────────────────────────────────────────

/** Oturuma özgü, kalıcı olmayan adlar. Skill adı yarın da anlamlı olmalı. */
const OTURUM_ARTIGI_AD = [
  /^(fix|debug|audit|test|temp|tmp|deneme|gecici)[-_]/i,
  /\b(bugun|today|now|simdi)\b/i,
  /\bpr[-_]?\d+/i,
  /^\d{4}-\d{2}-\d{2}/,
  /[-_](hatasi|error|issue|bug)\d*$/i,
];

const AD_BICIMI = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/**
 * Otonom üretilen bir skill önerisini değerlendirir.
 *
 * Hermes'te bu katman varsayılan KAPALI. Burada zorunlu ve fail-closed:
 * emin olunamayan öneri reddedilir.
 *
 * @param {{name:string, description?:string, content?:string, kaynakMetin?:string}} oneri
 * @param {{mevcutSkiller?: string[], korunanSkiller?: string[]}} [baglam]
 */
function degerlendirOneri(oneri, baglam = {}) {
  const red = (sebep) => ({ kabul: false, sebep });
  if (!oneri || typeof oneri !== 'object') return red('öneri nesnesi yok');

  const ad = String(oneri.name || '').trim();
  if (!AD_BICIMI.test(ad)) return red('geçersiz skill adı biçimi');
  if (OTURUM_ARTIGI_AD.some(k => k.test(ad))) {
    return red('ad yalnızca bugünkü göreve özgü — kalıcı bir sınıf adı değil');
  }

  const aciklama = String(oneri.description || '').trim();
  if (aciklama.length < 10) return red('açıklama çok kısa');
  if (aciklama.length > 1024) return red('açıklama 1024 karakteri aşıyor');

  const icerik = String(oneri.content || '');
  if (!icerik.trim()) return red('içerik boş');
  if (icerik.length > 100000) return red('içerik 100.000 karakteri aşıyor');

  // GÜVENLİK SİNYALİ FİLTRESİ — asıl ayrım burada.
  const taranan = [ad, aciklama, icerik, oneri.kaynakMetin || ''].join('\n');
  if (guvenlikSinyaliMi(taranan)) {
    return red('güvenlik davranışını gevşetmeye yönelik sinyal — öğrenilmez');
  }

  const korunan = baglam.korunanSkiller || [];
  if (korunan.includes(ad)) return red('korunan skill üzerine yazılamaz');

  // KONSOLİDASYON: yeterince benzer bir skill varsa yenisi YARATILMAZ.
  const mevcut = baglam.mevcutSkiller || [];
  const benzer = mevcut.find(m => benzerlikOrani(m, ad) >= 0.7);
  if (benzer) {
    return { kabul: true, eylem: 'patch', hedef: benzer, sebep: `mevcut "${benzer}" ile birleştirilecek` };
  }

  return { kabul: true, eylem: 'create', hedef: ad };
}

/** Basit ad benzerliği (token örtüşmesi) — şişen kütüphaneyi önlemek için. */
function benzerlikOrani(a, b) {
  const parcala = (s) => new Set(String(s).toLowerCase().split(/[-_.\s]+/).filter(Boolean));
  const A = parcala(a), B = parcala(b);
  if (!A.size || !B.size) return 0;
  let ortak = 0;
  for (const t of A) if (B.has(t)) ortak++;
  return ortak / Math.min(A.size, B.size);
}

/**
 * Yazma kapısı: otonom inceleyicinin dosyaya dokunmasına izin var mı?
 *
 * OKU-ÖNCE-YAZ zorunlu (Hermes'te de var, doğru bir kural): fork hedefi bu
 * turda okumadıysa körlemesine üzerine yazamaz.
 */
function yazmaIzni({ hedef, okunanlar = [], korunanlar = [], eylem }) {
  if (!hedef) return { izin: false, sebep: 'hedef yok' };
  if (korunanlar.includes(hedef)) return { izin: false, sebep: 'korunan skill' };
  if (eylem === 'patch' && !okunanlar.includes(hedef)) {
    return { izin: false, sebep: 'oku-önce-yaz: hedef bu turda okunmadı' };
  }
  return { izin: true };
}

module.exports = {
  guvenlikSinyaliMi,
  yeniDurum,
  aracTuruIsle,
  kullaniciTuruIsle,
  skillGuncellendi,
  incelemeGerekli,
  incelemeTamamlandi,
  degerlendirOneri,
  benzerlikOrani,
  yazmaIzni,
  GUVENLIK_KALIPLARI,
};
