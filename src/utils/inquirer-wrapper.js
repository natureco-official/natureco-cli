const { select, input, password, confirm, checkbox, Separator } = require('@inquirer/prompts');

/**
 * Seçenekleri @inquirer/prompts'un beklediği biçime çevirir.
 *
 * DEĞERİ OLMAYAN SEÇENEK AYRAÇ OLMALI. Kütüphane bir seçeneği ham değer sayıp
 * `String(secenek)` çağırıyor — kaynağındaki koşul birebir şu:
 *
 *     if (typeof choice !== 'object' || choice === null || !('value' in choice))
 *         const name = String(choice);
 *
 * Yani eski inquirer alışkanlığıyla yazılan `{ name: 'BAŞLIK', disabled: true }`
 * gibi başlık/ayraç satırları ekrana **[object Object]** olarak düşüyordu:
 * kurulum sihirbazında model listesinin başlıkları tam olarak böyle görünüyordu.
 * `name` alanı orada duruyor ama `value` olmadığı için hiç okunmuyor.
 *
 * Başlıklar zaten seçilemez olmalı; kütüphanenin bunun için hazır kavramı
 * Separator. Dönüşümü burada yapıyoruz çünkü burası kütüphaneye uyum sınırı —
 * çağıran her yer tek tek düzeltilmek zorunda kalmasın.
 */
function secenekleriDuzelt(secenekler) {
  return (secenekler || []).map(c => {
    if (typeof c === 'string') return { value: c, name: c };
    if (c && typeof c === 'object' && !Separator.isSeparator(c) && !('value' in c)) {
      return new Separator(c.name ?? '');
    }
    return c;
  });
}

module.exports = {
  secenekleriDuzelt,
  async prompt(questions) {
    // Non-TTY (pipe/script/CI): interaktif soru SORULAMAZ.
    // "readline was closed" çökmesi yerine güvenli varsayılanlarla dön:
    // confirm → default ?? false (onay istenmişse reddet), diğerleri → default ?? ''.
    if (!process.stdin.isTTY) {
      const results = {};
      for (const q of questions) {
        if (q.type === 'confirm') results[q.name] = q.default ?? false;
        else if (q.type === 'checkbox') results[q.name] = q.default ?? [];
        else results[q.name] = q.default ?? '';
      }
      return results;
    }
    const results = {};
    for (const q of questions) {
      if (q.type === 'list') {
        results[q.name] = await select({
          message: q.message,
          choices: secenekleriDuzelt(q.choices)
        });
      } else if (q.type === 'password') {
        results[q.name] = await password({ message: q.message, mask: q.mask });
      } else if (q.type === 'checkbox') {
        results[q.name] = await checkbox({
          message: q.message,
          choices: secenekleriDuzelt(q.choices)
        });
      } else if (q.type === 'confirm') {
        results[q.name] = await confirm({ message: q.message, default: q.default });
      } else {
        results[q.name] = await input({ message: q.message, default: q.default });
      }
    }
    return results;
  }
};
