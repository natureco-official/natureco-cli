/**
 * Soru listesi çizimi — başlık ve ayraç satırları.
 *
 * ÖLÇÜLEN HATA: kurulum sihirbazında model listesinin başlıkları ekrana
 * `[object Object]` olarak düşüyordu ve imleç seçilemez bir satırın üstünde
 * başlıyordu:
 *
 *     ❯ [object Object]
 *       [object Object]
 *         GPT-5.6 Sol — Complex reasoning and coding
 *
 * Sebep, @inquirer/prompts'un kendi normalizeChoices koşulu:
 *
 *     if (typeof choice !== 'object' || choice === null || !('value' in choice))
 *         const name = String(choice);
 *
 * Eski inquirer alışkanlığıyla yazılan `{ name: 'BAŞLIK', disabled: true }`
 * satırlarında `value` yok; kütüphane onları ham değer sayıp `String(nesne)`
 * çağırıyor. `name` orada duruyor ama hiç okunmuyor.
 *
 * Testler kütüphanenin GERÇEK bileşenini sahte akışlarla çizdirir — kendi
 * yorumumuzu değil, kullanıcının göreceği çıktıyı doğrular.
 */
const { Readable, Writable } = require('stream');
const { select, Separator } = require('@inquirer/prompts');
const { secenekleriDuzelt } = require('../../src/utils/inquirer-wrapper');
const { buildModelChoices } = require('../../src/utils/model-catalog');

const MODELLER = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', desc: 'Complex reasoning and coding', tier: 'flagship' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', desc: 'Intelligence and cost balance', tier: 'balanced' },
  { id: 'tiersiz', label: 'Tiersiz Model' },
];

/** Soruyu gerçekten çizer ve ekrana düşen metni döndürür. */
async function ciz(secenekler) {
  let cikti = '';
  const out = new Writable({ write(c, e, cb) { cikti += c.toString(); cb(); } });
  out.isTTY = true; out.columns = 90; out.rows = 30;
  const inp = new Readable({ read() {} });
  inp.isTTY = true; inp.setRawMode = () => {};

  const soz = select({ message: 'Select model', choices: secenekler }, { input: inp, output: out });
  const zaman = setTimeout(() => inp.push('\r'), 150);
  const secilen = await soz;
  clearTimeout(zaman);
  // ANSI kaçışlarını at — göz ne görüyorsa o kalsın. ESC karakteri kalıba kod
  // noktasıyla konur; kaynağa gömülü kontrol karakteri hem okunmaz hem de lint
  // uyarısı üretir.
  const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g');
  return { gorunen: cikti.replace(ANSI, ''), secilen };
}

describe('model seçim listesi çizimi', () => {
  test('başlıklar [object Object] olarak ÇİZİLMEZ', async () => {
    const { gorunen } = await ciz(secenekleriDuzelt(buildModelChoices(MODELLER)));
    expect(gorunen).not.toMatch(/\[object Object\]/);
  }, 20000);

  test('grup başlıkları adlarıyla görünür', async () => {
    const { gorunen } = await ciz(secenekleriDuzelt(buildModelChoices(MODELLER)));
    expect(gorunen).toContain('GÜÇLÜ');
    expect(gorunen).toContain('ORTA');
  }, 20000);

  test('tier\'sız model DİĞER altında listeye girer', () => {
    // Bu, çizilen kareye değil listeye ait bir iddia: varsayılan pencere 7 satır
    // gösterdiği için son grup ekranın altında kalıyor, ama listede olmalı —
    // katalog büyüdükçe hiçbir model sessizce kaybolmamalı.
    const adlar = secenekleriDuzelt(buildModelChoices(MODELLER))
      .map(c => c.separator || c.name || '').join('\n');
    expect(adlar).toContain('DİĞER');
    expect(adlar).toContain('Tiersiz Model');
  });

  test('model adları ve açıklamaları görünür', async () => {
    const { gorunen } = await ciz(secenekleriDuzelt(buildModelChoices(MODELLER)));
    expect(gorunen).toContain('GPT-5.6 Sol');
    expect(gorunen).toContain('Complex reasoning and coding');
    expect(gorunen).toContain('GPT-5.6 Terra');
  }, 20000);

  test('imleç başlığın değil, seçilebilir ilk modelin üstünde başlar', async () => {
    // Enter'a basıldığında seçilen değer gerçek bir model kimliği olmalı.
    const { secilen } = await ciz(secenekleriDuzelt(buildModelChoices(MODELLER)));
    expect(secilen).toBe('gpt-5.6-sol');
  }, 20000);

  test('DÜZELTİLMEDEN hata gerçekten oluşuyor — koruma boşuna değil', async () => {
    const { gorunen } = await ciz(buildModelChoices(MODELLER));
    expect(gorunen).toMatch(/\[object Object\]/);
  }, 20000);
});

describe('seçenek normalleştirme', () => {
  test('değeri olmayan seçenek ayraca çevrilir', () => {
    const c = secenekleriDuzelt([{ name: 'BAŞLIK', disabled: true }]);
    expect(Separator.isSeparator(c[0])).toBe(true);
  });

  test('değeri olan seçenek olduğu gibi kalır', () => {
    const asil = { name: 'Model', value: 'm1' };
    expect(secenekleriDuzelt([asil])[0]).toBe(asil);
  });

  test('düz metin seçenek ad ve değere açılır', () => {
    expect(secenekleriDuzelt(['abc'])[0]).toEqual({ name: 'abc', value: 'abc' });
  });

  test('hazır ayraç tekrar sarılmaz', () => {
    const s = new Separator('---');
    expect(secenekleriDuzelt([s])[0]).toBe(s);
  });

  test('boş/eksik liste çökertmez', () => {
    expect(secenekleriDuzelt(undefined)).toEqual([]);
    expect(secenekleriDuzelt([])).toEqual([]);
  });
});
