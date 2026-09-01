/**
 * getToolDefs() önbelleği çağırana sızdırmamalı.
 *
 * Hata: sendStreaming her turda dönen diziye plan/worktree/sanal araçları ve
 * enable_tools'u push ediyordu. getToolDefs() önbelleğin REFERANSINI döndürdüğü
 * için bu eklemeler kalıcı oluyor ve her turda birikiyordu: ikinci mesajda iki
 * `enable_tools`, beşincide beş tane sağlayıcıya gidiyordu.
 *
 * Neden ölümcül: enable_tools `_alwaysExpose: true` (tool-profile.js:127), yani
 * her istekte sunuluyor; ne tool-profile ne formatToolsForOpenAI tekilleştirme
 * yapıyor. OpenAI uyumlu sağlayıcıların çoğu yinelenen fonksiyon adında 400
 * döner — yani uzun chat oturumu birkaç turda ölürdü. Ayrıca dizi oturum
 * boyunca sınırsız büyüyordu.
 *
 * code_v5.js:641 aynı tuzağa düşmüyor çünkü her turda loadToolDefinitions()'ı
 * yeniden çağırıyor; bu test chat yolunun da aynı güvenceye sahip olmasını
 * sabitliyor.
 */
const { getToolDefs } = require('../src/commands/repl')._internal;

describe('getToolDefs önbellek yalıtımı', () => {
  it('her çağrıda farklı bir dizi nesnesi döndürür', () => {
    const a = getToolDefs();
    const b = getToolDefs();
    expect(Array.isArray(a)).toBe(true);
    expect(a.length).toBeGreaterThan(0);
    // Aynı referans olsaydı çağıranın push'u önbelleği kalıcı kirletirdi.
    expect(a).not.toBe(b);
  });

  it('dönen diziye eklemek sonraki çağrıyı etkilemez', () => {
    const taban = getToolDefs().length;

    // sendStreaming'in yaptığının aynısı: turluk araçları ekle.
    const tur1 = getToolDefs();
    tur1.push({ name: 'enable_tools', description: 'sanal', parameters: {} });
    tur1.push({ name: 'EnterPlanMode', description: 'sanal', parameters: {} });

    expect(getToolDefs().length).toBe(taban);

    // İkinci tur da temiz başlamalı.
    const tur2 = getToolDefs();
    tur2.push({ name: 'enable_tools', description: 'sanal', parameters: {} });
    expect(getToolDefs().length).toBe(taban);
  });

  it('art arda on tur sonrası önbellek büyümez', () => {
    const taban = getToolDefs().length;
    for (let i = 0; i < 10; i++) {
      const tur = getToolDefs();
      tur.push({ name: 'enable_tools', description: 'sanal', parameters: {} });
      tur.push({ name: 'CreateTask', description: 'sanal', parameters: {} });
    }
    expect(getToolDefs().length).toBe(taban);
  });

  it('tek bir turda yinelenen araç adı üretmez', () => {
    const tur = getToolDefs();
    tur.push({ name: 'enable_tools', description: 'sanal', parameters: {} });
    const adlar = tur.map(t => t.name);
    const yinelenen = adlar.filter((ad, i) => adlar.indexOf(ad) !== i);
    // Sağlayıcılar yinelenen fonksiyon adında 400 döndürür.
    expect(yinelenen).toEqual([]);
  });
});
