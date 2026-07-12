const { MESSAGES, validateCatalogParity, setLangCache, t } = require('../../src/utils/i18n');

describe('TR/EN catalog snapshots', () => {
  test('catalogs have exactly the same keys', () => {
    expect(validateCatalogParity()).toEqual({ ok: true, trOnly: [], enOnly: [], keys: Object.keys(MESSAGES.tr).length });
  });

  test('critical UI strings match stable snapshots', () => {
    setLangCache('tr');
    expect({ current: t('lang.current', { lang: 'tr' }), invalid: t('lang.invalid'), dna: t('dna.avgAi') }).toMatchInlineSnapshot(`
      {
        "current": "Şu anki dil: tr",
        "dna": "Ortalama YZ olasılığı",
        "invalid": "Geçersiz dil. \"tr\" veya \"en\" kullanın.",
      }
    `);
    setLangCache('en');
    expect({ current: t('lang.current', { lang: 'en' }), invalid: t('lang.invalid'), dna: t('dna.avgAi') }).toMatchInlineSnapshot(`
      {
        "current": "Current language: en",
        "dna": "Average AI probability",
        "invalid": "Invalid language. Use \"tr\" or \"en\".",
      }
    `);
  });
});
