'use strict';

/**
 * NatureCo CLI — hafif i18n katmanı.
 * Dil `~/.natureco/config.json` içindeki `language` alanından okunur (tr | en).
 * Yoksa ortam değişkeninden (LANG/LC_ALL) tahmin edilir; varsayılan Türkçe.
 *
 * Kullanım:  const { t } = require('../utils/i18n');  t('dna.avgAi')
 * Yeni çeviri eklemek: aşağıdaki MESSAGES.tr ve MESSAGES.en'e aynı anahtarı ekle.
 */

const { getConfig } = require('./config');

let _cache = null;

function getLang() {
  if (_cache) return _cache;
  try {
    const cfg = getConfig();
    if (cfg && (cfg.language === 'en' || cfg.language === 'tr')) {
      _cache = cfg.language;
      return _cache;
    }
  } catch (_) { /* config yoksa ortam değişkenine düş */ }
  const env = (process.env.NATURECO_LANG || process.env.LANG || process.env.LC_ALL || '').toLowerCase();
  _cache = env.startsWith('en') ? 'en' : 'tr'; // varsayılan: Türkçe-öncelikli
  return _cache;
}

/** Bellek önbelleğini güncelle (dil değiştirildiğinde çağrılır). */
function setLangCache(lang) {
  _cache = lang === 'en' ? 'en' : 'tr';
}

const MESSAGES = {
  tr: {
    // dna
    'dna.notInstalled': 'CodeDNA kurulu değil.',
    'dna.installHint': 'Kurmak için:',
    'dna.installDesc': 'CodeDNA, kodun ne kadarının yapay zekâ olduğunu ölçen NatureCo aracıdır.',
    'dna.unreadable': 'CodeDNA çıktısı okunamadı.',
    'dna.avgAi': 'Ortalama YZ olasılığı',
    'dna.maxFile': 'En yüksek dosya',
    'dna.scanned': 'Taranan dosya: {n}',
    'dna.topFiles': 'En yüksek YZ olasılıklı dosyalar:',
    'dna.understanding': 'anlama',
    'dna.debtTitle': '🧠 Anlama borcu',
    'dna.debtDesc': '(AI yazdı ama ekip muhtemelen anlamıyor):',
    'dna.detail': 'Ayrıntı için:',
    'dna.ecosystem': 'Ekosistem:',
    // lang
    'lang.current': 'Şu anki dil: {lang}',
    'lang.set': 'Dil ayarlandı: {lang} ✓',
    'lang.usage': 'Kullanım: natureco lang <tr|en>',
    'lang.invalid': 'Geçersiz dil. "tr" veya "en" kullanın.',
    'lang.restartHint': 'Değişiklik yeni komutlarda geçerli.',
  },
  en: {
    // dna
    'dna.notInstalled': 'CodeDNA is not installed.',
    'dna.installHint': 'Install with:',
    'dna.installDesc': "CodeDNA is the NatureCo tool that measures how much of your code is AI-written.",
    'dna.unreadable': "Couldn't read CodeDNA output.",
    'dna.avgAi': 'Average AI probability',
    'dna.maxFile': 'Highest file',
    'dna.scanned': 'Files scanned: {n}',
    'dna.topFiles': 'Highest AI-probability files:',
    'dna.understanding': 'understanding',
    'dna.debtTitle': '🧠 Understanding debt',
    'dna.debtDesc': "(AI-written code the team likely doesn't understand):",
    'dna.detail': 'For details:',
    'dna.ecosystem': 'Ecosystem:',
    // lang
    'lang.current': 'Current language: {lang}',
    'lang.set': 'Language set to: {lang} ✓',
    'lang.usage': 'Usage: natureco lang <tr|en>',
    'lang.invalid': 'Invalid language. Use "tr" or "en".',
    'lang.restartHint': 'Takes effect on the next commands.',
  },
};

/** Çeviri: geçerli dilde `key`'i döndür (yoksa TR'ye, o da yoksa key'in kendisine düşer). {var} enterpolasyonu. */
function t(key, vars) {
  const lang = getLang();
  const cat = MESSAGES[lang] || MESSAGES.tr;
  let s = cat[key];
  if (s == null) s = MESSAGES.tr[key];
  if (s == null) s = key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

module.exports = { t, getLang, setLangCache, MESSAGES };
