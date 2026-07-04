/**
 * memory_tree — ağaç-hafıza (kök→dal→yaprak). Kullanıcının OpenCode tree-memory
 * mimarisinden uyarlandı. Bu testler yapıyı ve yerleştirme/arama protokolünü kilitler.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import mod from '../../src/tools/memory_tree.js';

const { ensureTree, buildIndex, readRoot, search, append, treeDir } = mod._internal;
const U = 'test-tree-user';
afterEach(() => { try { fs.rmSync(treeDir(U), { recursive: true, force: true }); } catch {} });

describe('memory_tree (ağaç-hafıza)', () => {
  it('ensureTree kök dosyalarını + indeksi oluşturur', () => {
    ensureTree(U);
    for (const id of ['0-index', '1-kisisel', '2-teknik', '3-kararlar']) {
      expect(fs.existsSync(path.join(treeDir(U), id + '.md'))).toBe(true);
    }
  });

  it('append yaprağı doğru kök/dalın ALTINA ekler (dosya sonuna değil)', () => {
    const r = append(U, '2-teknik', 'Projeler', 'natureco-cli projesi npm de yayında');
    expect(r.success).toBe(true);
    expect(r.root).toBe('2-teknik');
    const content = readRoot(U, '2-teknik');
    expect(content).toMatch(/## Projeler\n- natureco-cli projesi/);
  });

  it('search yaprakları kök/dal etiketiyle bulur', () => {
    append(U, '1-kisisel', 'Tercihler', 'favori renk kırmızı');
    const hits = search(U, 'kırmızı');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatch(/1-kisisel\/Tercihler/);
  });

  it('olmayan dalı oluşturur (yeni ## başlık)', () => {
    append(U, '3-kararlar', 'Deploy Kararları', 'her deploy önce preview');
    const content = readRoot(U, '3-kararlar');
    expect(content).toContain('## Deploy Kararları');
    expect(content).toContain('her deploy önce preview');
  });

  it('buildIndex kökleri + dalları + kayıt sayısını listeler', () => {
    append(U, '1-kisisel', 'Kimlik', 'ad Gencay');
    const idx = buildIndex(U);
    expect(idx).toContain('1-kisisel');
    expect(idx).toContain('Kimlik');
    expect(idx).toMatch(/\[\d+ kayıt\]/);
  });

  it('execute: append + search uçtan uca', async () => {
    await mod.execute({ action: 'append', username: U, root: '2-teknik', branch: 'Kurulum & Sistem', content: 'node 24 kullaniliyor' });
    const res = await mod.execute({ action: 'search', username: U, query: 'node 24' });
    expect(res.success).toBe(true);
    expect(res.results.some((r) => /node 24/.test(r))).toBe(true);
  });

  it('getPending "Bekleyen İşler" dalındaki işleri döner (oturum başı hatırlatma)', () => {
    append(U, '3-kararlar', 'Bekleyen İşler', 'landing sayfasi deploy edilecek');
    append(U, '3-kararlar', 'Kararlar', 'bu bekleyen degil');
    const p = mod._internal.getPending(U);
    expect(p.some((x) => /landing/.test(x))).toBe(true);
    expect(p.some((x) => /bekleyen degil/.test(x))).toBe(false); // sadece Bekleyen İşler dalı
  });

  it('remove tamamlanan bekleyen işi kaldırır', () => {
    append(U, '3-kararlar', 'Bekleyen İşler', 'test gorevi tamamla');
    expect(mod._internal.getPending(U).some((x) => /test gorevi/.test(x))).toBe(true);
    const r = mod._internal.remove(U, '3-kararlar', 'test gorevi');
    expect(r.removed).toBeGreaterThan(0);
    expect(mod._internal.getPending(U).some((x) => /test gorevi/.test(x))).toBe(false);
  });
});
