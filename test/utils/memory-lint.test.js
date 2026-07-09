/**
 * memory-lint — Urðr-derived duplicate/conflict detection for NatureCo memory (v5.45).
 * Catches the drift that makes recall return the wrong remembered value.
 * v5.45.1: + searchTree Turkish-case / regex-special-char safety, branch preservation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mod from '../../src/utils/memory-lint.js';

const { lintFacts, lintTreeFile, lintUser, searchTree } = mod;

const tmpDirs = [];
function tmpTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-mem-'));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

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

  it('Türkçe İ/i farkı yinelenen tespitini bozmaz (İstanbul == istanbul)', () => {
    const f = lintFacts([
      { value: 'Ofis İstanbulda merkez şubede' },
      { value: 'ofis istanbulda merkez şubede' },
    ]);
    // foldTr olmadan "İstanbulda" ≠ "istanbulda" olur ve benzerlik düşerdi; folding ile aynı.
    expect(f.some((x) => x.level === 'duplicate')).toBe(true);
  });
});

describe('lintTreeFile — dal (branch) bağlamı korunur', () => {
  it('çakışan yapraklar doğru dal adıyla döner (hangisi nerede)', () => {
    const dir = tmpTree({
      '2-teknik.md':
        '# Teknik\n\n## Projeler\n- proje gizli kod adı ONYX-7 secildi\n\n## Kararlar\n- proje gizli kod adı FALCON-3 secildi\n',
    });
    const f = lintTreeFile(path.join(dir, '2-teknik.md'));
    const hit = f.find((x) => x.level === 'conflict' || x.level === 'duplicate');
    expect(hit).toBeTruthy();
    expect(hit.file).toBe('2-teknik.md');
    // Biri "Projeler", diğeri "Kararlar" dalında — branch bilgisi kaybolmamalı.
    expect([hit.aBranch, hit.bBranch].sort()).toEqual(['Kararlar', 'Projeler']);
  });

  it('olmayan dosya güvenli (boş döner, throw etmez)', () => {
    expect(lintTreeFile(path.join(os.tmpdir(), 'yok-boyle-bir-dosya-123.md'))).toEqual([]);
  });
});

describe('searchTree — Türkçe & regex-güvenli fallback arama', () => {
  it('Türkçe İ/i büyük-küçük harf duyarsız eşleşir', () => {
    const dir = tmpTree({
      '2-teknik.md': '# T\n\n## Projeler\n- İstanbul ofisi, İZMIR yedeği\n',
    });
    expect(searchTree('x', 'istanbul', { dir }).length).toBe(1); // küçük sorgu → İstanbul
    expect(searchTree('x', 'İSTANBUL', { dir }).length).toBe(1); // büyük sorgu da
    expect(searchTree('x', 'izmir', { dir }).length).toBe(1);    // İZMIR → izmir
    expect(searchTree('x', 'ankara', { dir }).length).toBe(0);   // yok → 0
  });

  it('regex-özel-karakter (parantez) literal eşleşir, regex olarak yorumlanmaz', () => {
    const dir = tmpTree({
      '2-teknik.md': '# T\n\n## Projeler\n- proje kod adı (v2) yayında\n',
    });
    expect(searchTree('x', 'kod adı (v2)', { dir }).length).toBe(1);
    expect(searchTree('x', '(v2)', { dir }).length).toBe(1);
  });

  it('çok kelimeli sorgu AND mantığı (tüm kelimeler geçmeli)', () => {
    const dir = tmpTree({
      '2-teknik.md': '# T\n\n## Projeler\n- proje kod adı VORTEX-8 yayında\n- başka bir kayıt\n',
    });
    expect(searchTree('x', 'kod vortex', { dir }).length).toBe(1);
    expect(searchTree('x', 'kod olmayan', { dir }).length).toBe(0); // "olmayan" yok → 0
  });

  it('sonuçta branch ve temiz metin (baştaki "- " kırpılmış) döner', () => {
    const dir = tmpTree({
      '1-kisisel.md': '# K\n\n## Tercihler\n- favori renk kırmızı\n',
    });
    const r = searchTree('x', 'kırmızı', { dir });
    expect(r.length).toBe(1);
    expect(r[0].branch).toBe('Tercihler');
    expect(r[0].text).toBe('favori renk kırmızı'); // "- " prefix yok
  });

  it('boş sorgu / olmayan dizin güvenli (boş döner)', () => {
    expect(searchTree('x', '', { dir: os.tmpdir() })).toEqual([]);
    expect(searchTree('x', '   ', { dir: os.tmpdir() })).toEqual([]);
    expect(searchTree('yok-boyle-kullanici-98765', 'test')).toEqual([]);
  });
});

describe('lintUser — dosya/dizin yoksa güvenli', () => {
  it('olmayan kullanıcı için hata fırlatmaz, boş sonuç döner', () => {
    const r = lintUser('yok-boyle-bir-kullanici-98765');
    expect(r.flatCount).toBe(0);
    expect(r.flatFindings).toEqual([]);
    expect(r.treeFindings).toEqual([]);
  });
});
