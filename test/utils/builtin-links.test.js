/**
 * builtin-links — yerleşiklerin ~/.natureco altında görünürlüğü (v5.49).
 *
 * Saha raporu: kullanıcılar skill/araçları ~/.natureco'da göremiyordu (npm
 * paketinin içinde yaşıyorlar). ensureBuiltinLinks junction/symlink kurar.
 * Bu testler: kurulum, idempotentlik, kırık bağlantı onarımı ve kullanıcı
 * verisine (gerçek klasör) dokunmama garantisini kilitler.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureBuiltinLinks, _internal } from '../../src/utils/builtin-links.js';

let base;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-links-'));
});

afterEach(() => {
  try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
});

describe('ensureBuiltinLinks', () => {
  it('skills-builtin ve tools bağlantılarını kurar; hedefler gerçek paket klasörleri', () => {
    ensureBuiltinLinks(base);
    for (const { name, target } of _internal.LINKS) {
      const link = path.join(base, name);
      expect(fs.lstatSync(link).isSymbolicLink(), `${name} bağlantı olmalı`).toBe(true);
      expect(fs.realpathSync(link)).toBe(fs.realpathSync(target));
      // bağlantı üzerinden içerik gerçekten okunabilmeli
      expect(fs.readdirSync(link).length).toBeGreaterThan(0);
    }
  });

  it('ikinci çağrı idempotenttir (mevcut sağlam bağlantıya dokunmaz)', () => {
    ensureBuiltinLinks(base);
    const before = fs.lstatSync(path.join(base, 'skills-builtin')).ino;
    ensureBuiltinLinks(base);
    expect(fs.lstatSync(path.join(base, 'skills-builtin')).ino).toBe(before);
  });

  it('kırık/yanlış hedefli bağlantıyı onarır', () => {
    fs.mkdirSync(base, { recursive: true });
    const wrongTarget = path.join(base, 'yanlis-hedef');
    fs.mkdirSync(wrongTarget);
    fs.symlinkSync(wrongTarget, path.join(base, 'skills-builtin'), process.platform === 'win32' ? 'junction' : 'dir');

    ensureBuiltinLinks(base);
    expect(fs.realpathSync(path.join(base, 'skills-builtin')))
      .toBe(fs.realpathSync(_internal.LINKS[0].target));
  });

  it('GERÇEK klasöre (bağlantı olmayan) asla dokunmaz — kullanıcı verisi korunur', () => {
    const realDir = path.join(base, 'tools');
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, 'kullanici-dosyasi.txt'), 'benim');

    ensureBuiltinLinks(base);

    expect(fs.lstatSync(realDir).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(realDir, 'kullanici-dosyasi.txt'), 'utf8')).toBe('benim');
  });

  it('hata durumunda fırlatmaz', () => {
    expect(() => ensureBuiltinLinks(path.join(base, 'yok', 'derin'))).not.toThrow();
  });
});
