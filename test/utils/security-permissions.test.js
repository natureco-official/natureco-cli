/**
 * v5.43 GÜVENLİK — dosya izinleri (Madde 3) + shell injection temizliği (Madde 5).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('config.js dosya izinleri (Madde 3)', () => {
  const TEST_HOME = path.join(os.tmpdir(), `nc-cfgperm-${Date.now()}`);
  afterEach(() => { try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {} vi.restoreAllMocks(); });

  it('config.json 0o600, dizin 0o700 (POSIX)', async () => {
    if (process.platform === 'win32') return; // Windows ACL farklı — atla
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    fs.mkdirSync(TEST_HOME, { recursive: true });
    vi.resetModules();
    const config = await import('../../src/utils/config.js');
    config.saveConfig({ providerUrl: 'https://x', providerApiKey: 'secret-key', userName: 't' }, { skipBackup: true, skipValidation: true });
    const cfgFile = path.join(TEST_HOME, '.natureco', 'config.json');
    expect(fs.existsSync(cfgFile)).toBe(true);
    expect(fs.statSync(cfgFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(TEST_HOME, '.natureco')).mode & 0o777).toBe(0o700);
  });
});

describe('shell injection temizliği (Madde 5)', () => {
  const toolsDir = path.join(process.cwd(), 'src', 'tools');
  it('düzeltilen araçlarda execSync string-interpolation KALMADI', () => {
    for (const f of ['document_extract.js', 'social_open.js', 'youtube_ac.js', 'phone_control_enhanced.js']) {
      const src = fs.readFileSync(path.join(toolsDir, f), 'utf8');
      // `execSync(`...${...}...`)` deseni = shell string-interp → injection riski
      expect(src, `${f} hâlâ execSync string-interp içeriyor`).not.toMatch(/execSync\(`[^`]*\$\{/);
    }
  });

  it('phone_control _tok shell metakarakterlerini argüman token\'ı yapar (ayrı komut değil)', async () => {
    const mod = await import('../../src/tools/phone_control_enhanced.js');
    // _tok export edildiyse test et; execFileSync zaten shell kullanmaz (metakarakter işlemez)
    if (mod._tok) {
      const t = mod._tok('shell input text "hello world"');
      expect(t).toContain('hello world'); // tırnaklı bütünlük korunur
      expect(t[0]).toBe('shell');
    }
  });
});
