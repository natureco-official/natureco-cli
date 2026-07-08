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

  it('gerçek skill index skill_view yönlendirmesi içerir + SKILL BAŞINA az char (tam açıklama gömmez)', () => {
    const prev = process.env.NATURECO_SKILL_INDEX;
    delete process.env.NATURECO_SKILL_INDEX;
    try {
      const idx = buildSkillIndex();
      if (!idx) return; // hiç skill yoksa (CI) atla
      expect(idx).toContain('skill_view');
      expect(idx).toContain('<available_skills>');
      // Regresyon: TOPLAM boyut / skill sayısı. Eski bug'da her skill ~350 char
      // (tam açıklama). Kompakt modda skill başına ~40 char (isim+virgül).
      const skillCount = mod._discoverSkills().length;
      if (skillCount > 0) {
        const charPerSkill = idx.length / skillCount;
        expect(charPerSkill).toBeLessThan(120); // eski gömülü-açıklama bunu 3× aşardı
      }
    } finally { if (prev !== undefined) process.env.NATURECO_SKILL_INDEX = prev; }
  });
});
