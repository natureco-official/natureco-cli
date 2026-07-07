/**
 * grep_search — v5.39 cross-platform regresyonu.
 *
 * Neden: eski fallback `spawn('grep', ...)` + komut tespiti `spawn('which', ...)`
 * kullanıyordu. İkisi de Windows'ta YOK (Git Bash olmadan) → ripgrep kurulu değilse
 * grep_search saf Windows'ta tamamen kırıktı. Artık ripgrep yoksa SAF NODE ile tarar
 * (hiçbir Unix komutu gerekmez). Bu testler Node fallback'in çalıştığını kilitler.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import gs from '../../src/tools/grep_search.js';

describe('grep_search — saf Node fallback (Windows dahil, harici komut gerekmez)', () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-test-'));
    fs.writeFileSync(path.join(dir, 'a.js'), 'const x = 1;\nfunction TARGET_TOKEN() {}\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'satır bir\nikinci TARGET_TOKEN satır\n');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'skip.js'), 'TARGET_TOKEN burada olmamalı\n');
  });
  afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('deseni birden çok dosyada bulur (dosya + satır no)', () => {
    const r = gs._grepWithNode('TARGET_TOKEN', dir, false, null, 50);
    expect(r.success).toBe(true);
    expect(r.tool).toBe('node');
    expect(r.count).toBe(2); // a.js + b.txt (node_modules HARİÇ)
    const files = r.results.map(x => path.basename(x.file)).sort();
    expect(files).toEqual(['a.js', 'b.txt']);
    expect(r.results[0].line).toBeGreaterThan(0);
  });

  it('node_modules/.git gibi dizinleri atlar', () => {
    const r = gs._grepWithNode('TARGET_TOKEN', dir, false, null, 50);
    expect(r.results.every(x => !x.file.includes('node_modules'))).toBe(true);
  });

  it('includePattern (glob) ile filtreler', () => {
    const r = gs._grepWithNode('TARGET_TOKEN', dir, false, '*.js', 50);
    expect(r.count).toBe(1);
    expect(path.basename(r.results[0].file)).toBe('a.js');
  });

  it('caseSensitive=false varsayılan (büyük/küçük harf duyarsız)', () => {
    const r = gs._grepWithNode('target_token', dir, false, null, 50);
    expect(r.count).toBe(2);
  });

  it('maxResults sınırına uyar', () => {
    const r = gs._grepWithNode('TARGET_TOKEN', dir, false, null, 1);
    expect(r.count).toBe(1);
  });

  it('geçersiz regex düz metne düşer (patlamaz)', () => {
    const r = gs._grepWithNode('TARGET_TOKEN(', dir, false, null, 50);
    expect(r.success).toBe(true); // atmaz
  });
});
