/**
 * memory-lint — Urðr-derived duplicate/conflict detection for NatureCo memory (v5.45).
 * Catches the drift that makes recall return the wrong remembered value.
 */
import { describe, it, expect } from 'vitest';
import mod from '../../src/utils/memory-lint.js';

const { lintFacts } = mod;

describe('memory-lint — conflict/duplicate detection', () => {
  it('çelişkili fact yakalar (aynı konu, farklı değer)', () => {
    // Gerçek dünyada patron.json'da görülen tür: iki farklı favori renk.
    const f = lintFacts([
      { value: 'Kullanıcının favori rengi kırmızı' },
      { value: 'Favori rengi mavidir' },
    ]);
    expect(f.length).toBeGreaterThan(0);
    expect(f.some((x) => x.level === 'conflict' || x.level === 'duplicate')).toBe(true);
  });

  it('iki farklı proje kod adını çelişki olarak işaretler', () => {
    const f = lintFacts([
      { value: 'Projenin gizli kod adi ONYX-7' },
      { value: 'Projenin gizli kod adi FALCON-3' },
    ]);
    expect(f.some((x) => x.level === 'conflict' || x.level === 'duplicate')).toBe(true);
  });

  it('yinelenen (neredeyse aynı) fact yakalar', () => {
    const f = lintFacts([
      { value: 'sqlite secildi yerel depolama icin performans' },
      { value: 'sqlite secildi yerel depolama performans' },
    ]);
    expect(f.some((x) => x.level === 'duplicate')).toBe(true);
  });

  it('alakasız fact\'ler temiz kalır (yanlış-pozitif yok)', () => {
    const f = lintFacts([
      { value: 'ahmet istanbulda yasiyor' },
      { value: 'python programlama dili tercih ediyor' },
      { value: 'sabahlari erken kalkiyor' },
    ]);
    expect(f.length).toBe(0);
  });

  it('boş/tek fact güvenli', () => {
    expect(lintFacts([])).toEqual([]);
    expect(lintFacts([{ value: 'tek fact' }])).toEqual([]);
    expect(lintFacts(null)).toEqual([]);
  });
});
