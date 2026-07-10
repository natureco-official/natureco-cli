/**
 * skill-index — v5.42 TOKEN optimizasyonu regresyonu.
 *
 * KRİTİK: eskiden her skill'in TAM `description`'i sysMsg'e gömülüyordu → yüzlerce
 * skill'de basit "merhaba" bile ~18K token prompt üretiyordu (gerçek ölçüm). Artık
 * kompakt (çok skill → isim-listesi). Bu testler token şişmesinin geri gelmemesini kilitler.
 */
import { describe, it, expect } from 'vitest';
import mod from '../../src/utils/skill-index.js';

const { buildSkillIndex, _shorten } = mod;

describe('_shorten (açıklama kısaltma)', () => {
  it('kısa metni aynen bırakır', () => {
    expect(_shorten('kısa', 88)).toBe('kısa');
  });
  it('uzun metni max\'a keser + … ekler (kelime sınırında)', () => {
    const long = 'Use this skill any time a spreadsheet file is the primary input or output and you need to read or write data';
    const out = _shorten(long, 48);
    expect(out.length).toBeLessThanOrEqual(50); // 48 + '…'
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1).trim())).toBe(true); // kesilen kısım orijinalin başı
  });
  it('boş/undefined güvenli', () => {
    expect(_shorten('', 48)).toBe('');
    expect(_shorten(undefined, 48)).toBe('');
  });
});

describe('buildSkillIndex — token bütçesi', () => {
  it('NATURECO_SKILL_INDEX=off → boş (skill index hiç gönderilmez)', () => {
    const prev = process.env.NATURECO_SKILL_INDEX;
    process.env.NATURECO_SKILL_INDEX = 'off';
    try { expect(buildSkillIndex()).toBe(''); }
    finally { if (prev === undefined) delete process.env.NATURECO_SKILL_INDEX; else process.env.NATURECO_SKILL_INDEX = prev; }
  });

  it('v5.51 varsayılanı (çok skill): TEK SATIR ipucu — isim listesi bile gömülmez', () => {
    const prev = process.env.NATURECO_SKILL_INDEX;
    delete process.env.NATURECO_SKILL_INDEX;
    try {
      const idx = buildSkillIndex();
      if (!idx) return; // hiç skill yoksa (CI) atla
      const skillCount = mod._discoverSkills().length;
      if (skillCount > 60) {
        // Progressive disclosure 2. seviye: sadece sayı + skill_find/skill_view yönlendirmesi
        expect(idx).toContain('skill_find');
        expect(idx).toContain('skill_view');
        expect(idx).toContain(String(skillCount));
        expect(idx.length).toBeLessThan(400); // 319 isim listesi ~5.800 chardı — geri gelmesin
      }
    } finally { if (prev !== undefined) process.env.NATURECO_SKILL_INDEX = prev; }
  });

  it('NATURECO_SKILL_INDEX=names → isim listesi geri gelir (opt-in) + skill başına az char', () => {
    const prev = process.env.NATURECO_SKILL_INDEX;
    process.env.NATURECO_SKILL_INDEX = 'names';
    try {
      const idx = buildSkillIndex();
      if (!idx) return;
      expect(idx).toContain('<available_skills>');
      const skillCount = mod._discoverSkills().length;
      if (skillCount > 0) {
        // Regresyon (v5.42): tam açıklama gömülmesin — isim modunda skill başına ~40 char
        expect(idx.length / skillCount).toBeLessThan(120);
      }
    } finally { if (prev === undefined) delete process.env.NATURECO_SKILL_INDEX; else process.env.NATURECO_SKILL_INDEX = prev; }
  });
});
