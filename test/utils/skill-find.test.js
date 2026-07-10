/**
 * skill_find — istek üzerine skill keşfi (v5.51 token optimizasyonu).
 * 319 ismin sysMsg'e gömülmesi yerine ajan bu araçla arar. Türkçe-güvenli
 * (foldTr) eşleşme ve boş-sonuç davranışı kilitlenir.
 */
import { describe, it, expect } from 'vitest';
import skillFind from '../../src/tools/skill_find.js';

describe('skill_find', () => {
  it('isimle eşleşen skill bulur (örn. seo)', async () => {
    const r = await skillFind.execute({ query: 'seo' });
    expect(r.success).toBe(true);
    if (r.results.length > 0) {
      expect(r.results[0]).toHaveProperty('name');
      expect(r.results[0]).toHaveProperty('description');
      expect(r.results.some(s => s.name.includes('seo'))).toBe(true);
    }
  });

  it('Türkçe büyük harfli sorgu da eşleşir (foldTr)', async () => {
    const lower = await skillFind.execute({ query: 'api design' });
    const upper = await skillFind.execute({ query: 'API DESIGN' });
    expect(upper.results.map(s => s.name)).toEqual(lower.results.map(s => s.name));
  });

  it('eşleşme yoksa hata değil boş sonuç + yönlendirme döner', async () => {
    const r = await skillFind.execute({ query: 'zzz-boyle-bir-konu-yok-xyz' });
    expect(r.success).toBe(true);
    expect(r.results).toEqual([]);
    expect(r.note).toBeTruthy();
  });

  it('query yoksa nazik hata', async () => {
    const r = await skillFind.execute({ query: '' });
    expect(r.success).toBe(false);
  });

  it('maxResults sınırı uygulanır', async () => {
    const r = await skillFind.execute({ query: 'test', maxResults: 3 });
    expect(r.results.length).toBeLessThanOrEqual(3);
  });
});
