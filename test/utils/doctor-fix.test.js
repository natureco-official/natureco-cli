/**
 * v5.43.2 — natureco doctor --fix regresyonu.
 *
 * BUG: `doctor()` `--fix`'i hiç işlemiyordu → "Unknown doctor action: --fix"
 * (README'de belgeli olmasına rağmen). Artık --fix (ve `fix` alt-komutu) düzeltilebilir
 * sorunları onarır: eksik veri dizinleri + hassas dosya izinleri (POSIX).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `nc-doctorfix-${Date.now()}`);

describe('doctor --fix (v5.43.2)', () => {
  afterEach(() => { try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {} vi.restoreAllMocks(); });

  it('applyFixes eksik veri dizinlerini oluşturur', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    fs.mkdirSync(TEST_HOME, { recursive: true });
    vi.resetModules();
    const doctor = (await import('../../src/commands/doctor.js')).default;
    const { applied } = doctor.applyFixes();
    expect(applied.some(a => a.includes('created dir'))).toBe(true);
    // beklenen dizinler artık var
    for (const d of ['memory', 'sessions', 'backups', 'audit']) {
      expect(fs.existsSync(path.join(TEST_HOME, '.natureco', d))).toBe(true);
    }
  });

  it('applyFixes config.json iznini 0600\'e sıkılaştırır (POSIX)', async () => {
    if (process.platform === 'win32') return; // Windows ACL — atla
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    fs.mkdirSync(path.join(TEST_HOME, '.natureco'), { recursive: true });
    fs.writeFileSync(path.join(TEST_HOME, '.natureco', 'config.json'), '{"providerApiKey":"secret"}');
    fs.chmodSync(path.join(TEST_HOME, '.natureco', 'config.json'), 0o644); // kasıtlı zayıf
    vi.resetModules();
    const doctor = (await import('../../src/commands/doctor.js')).default;
    doctor.applyFixes();
    expect(fs.statSync(path.join(TEST_HOME, '.natureco', 'config.json')).mode & 0o777).toBe(0o600);
  });

  it('doctor(["--fix"]) "Unknown doctor action" HATASI vermez (asıl bug)', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    fs.mkdirSync(TEST_HOME, { recursive: true });
    vi.resetModules();
    const doctor = (await import('../../src/commands/doctor.js')).default;
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.map(String).join(' ')));
    doctor(['--fix']);
    const out = logs.join('\n');
    expect(out).not.toContain('Unknown doctor action');
    expect(out).toMatch(/Otomatik Düzeltme|Auto-Fix/);
  });
});
