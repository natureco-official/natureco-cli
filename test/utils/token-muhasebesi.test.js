/**
 * Token muhasebesi: Latin dışı düzeltmesi + sağlayıcı usage'ı temel alma.
 *
 * Eski tahmin her yerde düz `chars/4` idi. İki sorunu vardı:
 *
 *  1) Latin dışı metinde ciddi DÜŞÜK tahmin. CJK'de bir karakter tipik olarak
 *     ~1 token'dır, yani chars/4 gerçek maliyetin dörtte birini gösteriyordu.
 *     Türkçe'nin aksanlı harfleri de fazladan bayt taşır. Türkçe öncelikli bir
 *     üründe bu, bağlamın dolduğunu geç fark edip sağlayıcıdan context-length
 *     hatası yemek demek.
 *
 *  2) Hata birikimi. 50 mesajlık bir transkriptte %20'lik sapma, kırpma
 *     kararını tamamen yanlış yere taşıyabiliyordu. Sağlayıcı zaten her
 *     yanıtta gerçek `usage` döndürüyor ama bu yalnızca muhasebe için
 *     kaydediliyor, kırpma kararına geri beslenmiyordu.
 */
const tb = require('../../src/utils/token-budget');

const msg = (t) => [{ role: 'user', content: t }];

describe('Latin dışı karakter düzeltmesi', () => {
  test('ASCII metinde tahmin değişmez (yanlış şişirme yok)', () => {
    const en = 'The user said we need to review the changes and fix the bugs.';
    const eski = Math.ceil((en.length + 16) / 4);
    expect(tb.estimateMessageTokens(msg(en))).toBe(eski);
  });

  test('Türkçe aksanlı harfler ek maliyet alır', () => {
    const tr = 'Değişiklikleri gözden geçirip güvenlik açıklarını düzeltmemiz gerekiyor.';
    const duz = Math.ceil((tr.length + 16) / 4);
    expect(tb.estimateMessageTokens(msg(tr))).toBeGreaterThan(duz);
  });

  test('CJK metni belirgin şekilde daha pahalı sayılır', () => {
    const cjk = '用户说我们需要审查更改并修复安全漏洞';
    const duz = Math.ceil((cjk.length + 16) / 4);
    const yeni = tb.estimateMessageTokens(msg(cjk));
    // CJK'de karakter ~1 token; chars/4 dörtte bir gösteriyordu.
    expect(yeni).toBeGreaterThan(duz * 2);
  });

  test('ek maliyet fonksiyonu ASCII için sıfır', () => {
    expect(tb.latinDisiEkMaliyet('plain ascii text 123')).toBe(0);
  });

  test('ek maliyet CJK ve aksanlı için pozitif', () => {
    expect(tb.latinDisiEkMaliyet('用户')).toBeGreaterThan(0);
    expect(tb.latinDisiEkMaliyet('ğüşiöç')).toBeGreaterThan(0);
  });

  test('tool_calls da düzeltmeden geçer', () => {
    const ilesiz = [{ role: 'assistant', content: '', tool_calls: [{ function: { arguments: '{"q":"test"}' } }] }];
    const ileTr = [{ role: 'assistant', content: '', tool_calls: [{ function: { arguments: '{"q":"değişiklikleri gözden geçir"}' } }] }];
    expect(tb.estimateMessageTokens(ileTr)).toBeGreaterThan(tb.estimateMessageTokens(ilesiz));
  });
});

describe('sağlayıcı usage temelli bağlam sayımı', () => {
  const uzun = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `mesaj ${i} ${'x'.repeat(50)}` }));

  test('gerçek usage varsa o esas alınır, kuyruk tahmin edilir', () => {
    const sonuc = tb.estimateContextTokens(uzun, { usage: { total_tokens: 5000 }, afterIndex: 19 });
    // 5000 gerçek + kalan 10 mesajın tahmini
    expect(sonuc).toBeGreaterThan(5000);
    expect(sonuc).toBeLessThan(5000 + tb.estimateMessageTokens(uzun));
  });

  test('usage yoksa davranış eskisiyle aynı (saf tahmin)', () => {
    expect(tb.estimateContextTokens(uzun, undefined)).toBe(tb.estimateMessageTokens(uzun));
    expect(tb.estimateContextTokens(uzun, {})).toBe(tb.estimateMessageTokens(uzun));
  });

  test('prompt_tokens ve input_tokens alanları da kabul edilir', () => {
    const a = tb.estimateContextTokens(uzun, { usage: { prompt_tokens: 3000 }, afterIndex: 19 });
    const b = tb.estimateContextTokens(uzun, { usage: { input_tokens: 3000 }, afterIndex: 19 });
    expect(a).toBeGreaterThan(3000);
    expect(a).toBe(b);
  });

  test('bozuk usage saf tahmine düşer', () => {
    expect(tb.estimateContextTokens(uzun, { usage: { total_tokens: 0 }, afterIndex: 5 }))
      .toBe(tb.estimateMessageTokens(uzun));
    expect(tb.estimateContextTokens(uzun, { usage: { total_tokens: 100 }, afterIndex: -1 }))
      .toBe(tb.estimateMessageTokens(uzun));
  });

  test('dizi olmayan girdi sıfır döner', () => {
    expect(tb.estimateContextTokens(null)).toBe(0);
    expect(tb.estimateMessageTokens(undefined)).toBe(0);
  });
});
