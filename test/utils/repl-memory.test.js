/**
 * repl — oturum-sonu fact çıkarımı (extractPreferenceFacts) v5.40 regresyonu.
 *
 * KRİTİK bug: pattern `ad[ıi]m?` (m OPSİYONEL) "kod adı", "proje adı", "dosya adı"
 * gibi MASUM tamlamaları "kullanıcı adı" sanıyor + değeri lowercase/\w ile bozuyordu:
 * "projenin gizli kod adı ZEPHYR-9" → "Kullanici ad: zephyr". Agent memory_write ile
 * DOĞRU kaydetse bile üzerine YANLIŞ fact yazıp cross-session recall'i bozuyordu
 * (gerçek macOS SSH testinde yakalandı). Bu testler o bozulmanın geri gelmemesini kilitler.
 */
import { describe, it, expect } from 'vitest';
import startRepl from '../../src/commands/repl.js';

const { extractPreferenceFacts } = startRepl;

describe('extractPreferenceFacts — "kod adı" bozulması (v5.40 regresyon)', () => {
  it('"kod adı X" / "proje adı X" / "dosya adı X" YANLIŞLIKLA ad olarak yakalanMAZ', () => {
    for (const s of [
      'projenin gizli kod adı ZEPHYR-9',
      'proje adı ONYX-7',
      'dosya adı test.js',
      'sunucunun kod adı FALCON-3 olsun',
    ]) {
      const facts = extractPreferenceFacts(s);
      const adFact = facts.find(f => f.key === 'ad');
      expect(adFact, `"${s}" ad olarak yakalanmamalı`).toBeUndefined();
    }
  });

  it('gerçek isim ifadeleri DOĞRU yakalanır + değer orijinal case korunur', () => {
    expect(extractPreferenceFacts('benim adım Ahmet')[0]).toMatchObject({ key: 'ad', value: 'Kullanici ad: Ahmet' });
    expect(extractPreferenceFacts('adım Mehmet')[0]).toMatchObject({ key: 'ad', value: 'Kullanici ad: Mehmet' });
    expect(extractPreferenceFacts('ismim Zeynep')[0]).toMatchObject({ key: 'ad', value: 'Kullanici ad: Zeynep' });
  });

  it('değeri lowercase\'e ÇEVİRMEZ ve sayı/tireyi düşürmez (ZEPHYR-9 bozulmaz)', () => {
    // Bir isim ifadesinde büyük harf + tire + sayı korunmalı
    const facts = extractPreferenceFacts('adım ONYX-7');
    expect(facts[0].value).toBe('Kullanici ad: ONYX-7'); // "onyx" değil, "-7" düşmemiş
  });

  it('boş/alakasız içerikte fact üretmez', () => {
    expect(extractPreferenceFacts('')).toEqual([]);
    expect(extractPreferenceFacts('bugün hava çok güzel')).toEqual([]);
    expect(extractPreferenceFacts(undefined)).toEqual([]);
  });

  it('konum/tercih: nesne fiilden ÖNCE (Türkçe) — doğru kelimeyi alır', () => {
    const loc = extractPreferenceFacts('İstanbulda yaşıyorum').find(f => f.key === 'yer');
    expect(loc && loc.value).toMatch(/İstanbul/i);
  });
});
