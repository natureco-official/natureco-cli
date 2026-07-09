/**
 * tr-text — Turkish-aware case folding. Guards the real recall bug where
 * "İstanbul".toLowerCase() === "i̇stanbul" (combining dot) silently breaks matching.
 */
import { describe, it, expect } from 'vitest';
import mod from '../../src/utils/tr-text.js';

const { foldTr, foldIncludes } = mod;

describe('foldTr — dört Türkçe i-varyantı tek forma iner', () => {
  it('İ / I / ı / i hepsi "i" olur', () => {
    expect(foldTr('İ')).toBe('i');
    expect(foldTr('I')).toBe('i');
    expect(foldTr('ı')).toBe('i');
    expect(foldTr('i')).toBe('i');
  });

  it('İstanbul varyantları aynı forma iner (combining-dot tuzağı yok)', () => {
    const forms = ['İstanbul', 'istanbul', 'ISTANBUL', 'ıstanbul', 'İSTANBUL'];
    for (const f of forms) expect(foldTr(f)).toBe('istanbul');
    // Kritik: birleşik nokta (U+0307) İ folding'de OLUŞMAMALI.
    expect(foldTr('İstanbul')).not.toContain('̇');
  });

  it('İngilizce kelimeler bozulmaz (FILE -> file, fıle DEĞİL)', () => {
    expect(foldTr('FILE')).toBe('file');
    expect(foldTr('File')).toBe('file');
  });

  it('anlam taşıyan ş/ç/ğ/ö/ü korunur (çakışmaya izin yok)', () => {
    expect(foldTr('şık')).toBe('şik');   // ş korunur
    expect(foldTr('sık')).toBe('sik');   // s korunur → "şık" ile çakışmaz
    expect(foldTr('şık')).not.toBe(foldTr('sık'));
    expect(foldTr('coğrafya')).toBe('coğrafya');
  });

  it('null/undefined/sayı güvenli', () => {
    expect(foldTr(null)).toBe('');
    expect(foldTr(undefined)).toBe('');
    expect(foldTr(42)).toBe('42');
  });
});

// NİYET testleri (regresyon DEĞİL): foldTr'nin bilinçli ı/i tavizini belgeler.
// Bunlar KASITLI davranışı sabitler — biri "kıl/kil karışıyor, bug!" deyip foldTr'yi
// değiştirmeye kalkmasın diye. Ayrıntı: src/utils/tr-text.js JSDoc "BİLİNÇLİ TAVİZ".
describe('foldTr — bilinçli tasarım tercihleri (niyet testleri, regresyon DEĞİL)', () => {
  it('ı/i çakışması BİLEREK var: "kıl" (hair) === "kil" (clay)', () => {
    // bilinçli taviz, bkz. tr-text.js yorumu — arama safety-net'i için kabul edildi
    expect(foldTr('kıl')).toBe(foldTr('kil'));
  });
  it('taviz yalnızca ı/i ile sınırlı: "şık" !== "sık" (ş/ç/ğ/ö/ü korunur)', () => {
    expect(foldTr('şık')).not.toBe(foldTr('sık'));
  });
});

describe('foldIncludes — Türkçe-güvenli substring', () => {
  it('büyük-küçük ve i-varyantı fark etmeksizin bulur', () => {
    expect(foldIncludes('Ofis İstanbulda', 'istanbul')).toBe(true);
    expect(foldIncludes('ISPARTA merkez', 'ısparta')).toBe(true);
    expect(foldIncludes('proje FILE yolu', 'file')).toBe(true);
  });
  it('alakasız metinde bulmaz', () => {
    expect(foldIncludes('ankara', 'istanbul')).toBe(false);
  });
  it('özel karakterleri literal alır (regex değil)', () => {
    expect(foldIncludes('sürüm (v2) yayında', '(v2)')).toBe(true);
    expect(foldIncludes('sürüm v2 yayında', '(v2)')).toBe(false);
  });
});
