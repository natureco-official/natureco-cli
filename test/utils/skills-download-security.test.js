/**
 * v5.43 GÜVENLİK — skill indirme allowlist + path traversal (Madde 6).
 *
 * Eskiden `source` doğrudan modelden gelip HERHANGİ bir GitHub repo indirilebiliyordu
 * (KNOWN_REPOS hiç kullanılmıyordu). İndirilen SKILL.md → skills_autoload → system
 * prompt enjeksiyonu → (shell_command bypass'ıyla) RCE zinciri. Ayrıca additionalFiles
 * `af.path` traversal ile skill dizini dışına yazabiliyordu.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import mod from '../../src/tools/skills_download.js';

describe('skills_download — repo allowlist (Madde 6)', () => {
  it('bilinen repolar kabul edilir', () => {
    expect(mod.isKnownRepo('anthropics', 'skills')).toBe(true);
    expect(mod.isKnownRepo('ANTHROPICS', 'Skills')).toBe(true); // case-insensitive
  });
  it('rastgele/bilinmeyen repo reddedilir', () => {
    expect(mod.isKnownRepo('rastgele', 'rastgele')).toBe(false);
    expect(mod.isKnownRepo('evil', 'malware')).toBe(false);
    expect(mod.isKnownRepo('', '')).toBe(false);
  });
  it('download action bilinmeyen kaynağı reddeder (network\'e gitmeden)', async () => {
    const out = JSON.parse(await mod.execute({ action: 'download', source: 'evil/malware' }));
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/güvenlik|onay|bilinen/i);
  });
  it('list_skills action bilinmeyen kaynağı reddeder', async () => {
    const out = JSON.parse(await mod.execute({ action: 'list_skills', source: 'evil/malware' }));
    expect(out.success).toBe(false);
  });
});

describe('skills_download — path traversal (Madde 6)', () => {
  const TMP = path.join(os.tmpdir(), `nc-skilldl-${Date.now()}`);
  beforeEach(() => { fs.mkdirSync(TMP, { recursive: true }); });
  afterEach(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

  it('traversal içeren skill adı hedef dizin DIŞINA yazamaz', async () => {
    // basename normalize eder → her durumda TMP İÇİNDE kalmalı, asla dışarı çıkmamalı
    const r = await mod.downloadSkill({ name: '../../../../tmp/nc-evil-escape', content: 'x', metadata: {} }, TMP);
    if (r.success) {
      expect(mod._isInside(TMP, r.path)).toBe(true);
    }
    // TMP dışında beklenmedik bir yere yazılmadı
    expect(fs.existsSync(path.resolve(TMP, '../../../../tmp/nc-evil-escape/SKILL.md'))).toBe(false);
  });

  it('_isInside base dışını reddeder', () => {
    expect(mod._isInside(TMP, path.join(TMP, 'skill'))).toBe(true);
    expect(mod._isInside(TMP, path.resolve(TMP, '../../etc/passwd'))).toBe(false);
    expect(mod._isInside(TMP, path.resolve(TMP, 'sub/../ok'))).toBe(true);
  });
});
