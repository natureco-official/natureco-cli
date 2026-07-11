const chalk = require('chalk');
const { setConfigValue } = require('../utils/config');
const { t, getLang, setLangCache } = require('../utils/i18n');

/**
 * `natureco lang [tr|en]` — arayüz dilini görüntüle/ayarla.
 * Ayar `~/.natureco/config.json` içindeki `language` alanına yazılır ve
 * i18n katmanı + ajanın system-prompt'u bunu okur (EN → İngilizce deneyim).
 */
async function lang(arg) {
  const label = (l) => (l === 'en' ? 'English (en)' : 'Türkçe (tr)');
  const val = (arg || '').toLowerCase().trim();

  if (!val) {
    console.log('\n  ' + t('lang.current', { lang: label(getLang()) }));
    console.log('  ' + chalk.gray(t('lang.usage')) + '\n');
    return;
  }
  if (val !== 'tr' && val !== 'en') {
    console.log('\n  ' + chalk.red(t('lang.invalid')) + '\n');
    process.exitCode = 1;
    return;
  }

  setConfigValue('language', val);
  setLangCache(val);
  console.log('\n  ' + chalk.green(t('lang.set', { lang: label(val) })));
  console.log('  ' + chalk.gray(t('lang.restartHint')) + '\n');
}

module.exports = lang;
