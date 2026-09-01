/**
 * Model seçim listesi hiçbir modeli düşürmemeli.
 *
 * Ölçülen iki hata (1 Eylül 2026, kullanıcı bildirdi):
 *
 * 1) Gruplar setup.js içinde SABİT KODLUYDU (flagship/reasoning, balanced,
 *    fast, classic, audio/vision/embedding/custom). Bu listelerin hiçbirine
 *    uymayan bir `tier` değeri modeli SESSİZCE düşürüyordu.
 *    Ölçüm: 76 modelin 15'i seçim ekranında hiç görünmüyordu — preview,
 *    agentic, legacy, coding, research katmanlarının tamamı. Model katalogda
 *    vardı ve `natureco models` onu listeliyordu, ama kurulumda seçilemiyordu.
 *
 * 2) Satır `${label} (${cost})` biçimindeydi ve katalogda `cost` 76/76 boştu;
 *    ekranda "Claude Fable 5 ()" görünüyordu.
 */
const { getSetupPresets, buildModelChoices } = require('../../src/utils/model-catalog');

const L = (tr) => tr;
const degerler = (secenekler) => secenekler.filter(s => s.value).map(s => s.value);

describe('model seçim listesi', () => {
  test('katalogdaki HER model listede yer alır', () => {
    const P = getSetupPresets(L);
    for (const [saglayici, p] of Object.entries(P)) {
      const ms = p.models || [];
      const gorunen = new Set(degerler(buildModelChoices(ms, L)));
      const kayip = ms.filter(m => !gorunen.has(m.id)).map(m => `${m.id}(tier=${m.tier})`);
      expect(kayip, `${saglayici} içinde düşen model`).toEqual([]);
    }
  });

  test('bilinmeyen tier değeri modeli düşürmez', () => {
    const sec = buildModelChoices([
      { id: 'a', label: 'A', tier: 'flagship' },
      { id: 'b', label: 'B', tier: 'uyduruk-katman' },
      { id: 'c', label: 'C' }, // tier hiç yok
    ], L);
    expect(degerler(sec)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  test('bilinmeyen tier "DİĞER" başlığı altında toplanır', () => {
    const sec = buildModelChoices([{ id: 'b', label: 'B', tier: 'xyz' }], L);
    expect(sec.some(s => s.name.includes('DİĞER'))).toBe(true);
  });

  test('boş cost için boş parantez basılmaz', () => {
    const sec = buildModelChoices([{ id: 'a', label: 'Claude Fable 5', tier: 'flagship', cost: '' }], L);
    const satir = sec.find(s => s.value === 'a');
    expect(satir.name).not.toMatch(/\(\s*\)/);
    expect(satir.name).toContain('Claude Fable 5');
  });

  test('gerçek katalogda hiç boş parantez yok', () => {
    const P = getSetupPresets(L);
    for (const p of Object.values(P)) {
      for (const s of buildModelChoices(p.models || [], L)) {
        if (s.value) expect(s.name).not.toMatch(/\(\s*\)/);
      }
    }
  });

  test('dolu açıklama ve maliyet gösterilir', () => {
    const sec = buildModelChoices(
      [{ id: 'a', label: 'A', tier: 'flagship', desc: 'güçlü', cost: '$1/$2' }], L);
    expect(sec.find(s => s.value === 'a').name).toContain('güçlü');
    expect(sec.find(s => s.value === 'a').name).toContain('$1/$2');
  });

  test('label yoksa id gösterilir (isim hiç boş kalmaz)', () => {
    const sec = buildModelChoices([{ id: 'ham-id', tier: 'flagship' }], L);
    expect(sec.find(s => s.value === 'ham-id').name).toContain('ham-id');
  });

  test('boş liste boş sonuç verir, patlamaz', () => {
    expect(buildModelChoices([], L)).toEqual([]);
    expect(buildModelChoices(null, L)).toEqual([]);
    expect(buildModelChoices(undefined, L)).toEqual([]);
  });

  test('gruplar yalnızca dolu olduklarında başlık üretir', () => {
    const sec = buildModelChoices([{ id: 'a', label: 'A', tier: 'flagship' }], L);
    expect(sec.some(s => s.name.includes('GÜÇLÜ'))).toBe(true);
    expect(sec.some(s => s.name.includes('SES'))).toBe(false);
  });

  test('her model tam bir kez listelenir', () => {
    const P = getSetupPresets(L);
    for (const p of Object.values(P)) {
      const d = degerler(buildModelChoices(p.models || [], L));
      expect(d.length).toBe(new Set(d).size);
    }
  });
});
