/**
 * Kurulum sihirbazında abonelik seçeneği.
 *
 * NEDEN VAR: sihirbaz uzun süre YALNIZCA API anahtarlı sağlayıcıları
 * sunuyordu. ChatGPT aboneliği olan biri, aboneliğiyle bedavaya
 * kullanabilecekken doğrudan "API Key:" istemine yönlendiriliyordu — üstelik
 * anahtarsız çalışma yolu üründe zaten vardı. İlk kurulum, aracın en pahalı
 * yanlış yönlendirme noktası.
 */
const { abonelikSecenekleri } = require('../../src/commands/setup')._internal;

const L = (tr) => tr;

const hazir = (ad, anahtar) => ({
  anahtar, ad, kullanilabilir: true, sebep: '', kurulum: `npm i -g ${anahtar}`, giris: `${anahtar} login`,
});
const oturumsuz = (ad, anahtar) => ({
  anahtar, ad, kullanilabilir: false, sebep: 'oturum süresi dolmuş',
  kurulum: `npm i -g ${anahtar}`, giris: `${anahtar} login`,
});
const kurulmamis = (ad, anahtar) => ({
  anahtar, ad, kullanilabilir: false, sebep: `${anahtar} CLI kurulu değil`,
  kurulum: `npm i -g ${anahtar}`, giris: `${anahtar} login`,
});

describe('sihirbaz abonelik satırları', () => {
  test('kullanılabilir abonelik SEÇİLEBİLİR ve anahtar gerekmediğini söyler', () => {
    const s = abonelikSecenekleri(L, { codex: hazir('ChatGPT (OpenAI)', 'codex') });
    const secilebilir = s.filter(x => x.value);
    expect(secilebilir).toHaveLength(1);
    expect(secilebilir[0].value).toBe('abonelik:codex');
    expect(secilebilir[0].name).toMatch(/ChatGPT/);
    expect(secilebilir[0].name).toMatch(/GEREKMEZ/);
  });

  test('kurulu ama oturumsuz sağlayıcı GİZLENMEZ — ne yapılacağını söyler', () => {
    // Gizlemek, kullanıcının böyle bir yol olduğunu hiç öğrenememesi demek.
    const s = abonelikSecenekleri(L, { claude: oturumsuz('Claude (Anthropic)', 'claude') });
    const satir = s.find(x => /Claude/.test(x.name));
    expect(satir).toBeDefined();
    expect(satir.value).toBeUndefined();   // seçilemez
    expect(satir.disabled).toBe(true);
    expect(satir.name).toMatch(/claude login/); // düzeltme komutu görünür
  });

  test('hiç kurulu olmayan sağlayıcı listeyi şişirmez', () => {
    const s = abonelikSecenekleri(L, { codex: kurulmamis('ChatGPT (OpenAI)', 'codex') });
    expect(s).toEqual([]);
  });

  test('hiç abonelik yoksa sihirbaz aynen eskisi gibi kalır', () => {
    expect(abonelikSecenekleri(L, {})).toEqual([]);
  });

  test('abonelik varsa listenin sonuna ayraç konur', () => {
    const s = abonelikSecenekleri(L, { codex: hazir('ChatGPT (OpenAI)', 'codex') });
    expect(s[s.length - 1].disabled).toBe(true);
    expect(s[s.length - 1].name).toMatch(/─/);
  });

  test('birden çok abonelik varsa hepsi listelenir', () => {
    const s = abonelikSecenekleri(L, {
      codex: hazir('ChatGPT (OpenAI)', 'codex'),
      claude: hazir('Claude (Anthropic)', 'claude'),
    });
    expect(s.filter(x => x.value).map(x => x.value)).toEqual(['abonelik:codex', 'abonelik:claude']);
  });

  test('seçilen değer sohbet katmanının anladığı biçimde', () => {
    // repl/code bu ön eke bakarak köprüyü açıyor; biçim bozulursa sessizce
    // normal sağlayıcı sanılır ve abonelik hiç devreye girmez.
    const s = abonelikSecenekleri(L, { codex: hazir('ChatGPT (OpenAI)', 'codex') });
    const { abonelikKipi, secilenSaglayici } = require('../../src/utils/abonelik-baglayici');
    const secim = s.find(x => x.value).value;
    expect(abonelikKipi({ providerUrl: secim })).toBe(true);
    expect(secilenSaglayici({ providerUrl: secim })).toBe('codex');
  });

  test('gerçek makinede çökmeden çalışır', () => {
    const s = abonelikSecenekleri(L);
    expect(Array.isArray(s)).toBe(true);
    for (const x of s) expect(typeof x.name).toBe('string');
  });
});
