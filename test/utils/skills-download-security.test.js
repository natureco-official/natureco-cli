/**
 * v5.43 GÜVENLİK — skill indirme allowlist + path traversal (Madde 6).
 *
 * Eskiden `source` doğrudan modelden gelip HERHANGİ bir GitHub repo indirilebiliyordu
 * (KNOWN_REPOS hiç kullanılmıyordu). İndirilen SKILL.md → skills_autoload → system
 * prompt enjeksiyonu → (shell_command bypass'ıyla) RCE zinciri. Ayrıca additionalFiles
 * `af.path` traversal ile skill dizini dışına yazabiliyordu.
 */
import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import https from 'https';
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
  afterEach(() => {
    vi.restoreAllMocks();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  });

  function mockDownload(status, body) {
    vi.spyOn(https, 'get').mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        callback(response);
        queueMicrotask(() => {
          response.emit('data', body);
          response.emit('end');
        });
      });
      return request;
    });
  }

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

  it('reports successful additional-file downloads per file', async () => {
    mockDownload(200, 'supporting content');
    const result = await mod.downloadSkill({
      name: 'complete-skill', description: 'complete', content: 'instructions', metadata: {},
      additionalFiles: [{ path: 'references/guide.md', url: 'https://example.invalid/guide.md' }],
    }, TMP);

    expect(result).toMatchObject({ success: true, partial: false, downloadedFiles: 1, failedFiles: 0 });
    expect(result.fileOutcomes).toEqual([{ path: 'references/guide.md', success: true, status: 'downloaded' }]);
    expect(fs.existsSync(path.join(result.path, 'references', 'guide.md'))).toBe(true);
  });

  it('reports non-2xx additional-file downloads as visible partial failure', async () => {
    mockDownload(404, 'not found');
    const result = await mod.downloadSkill({
      name: 'partial-skill', description: 'partial', content: 'instructions', metadata: {},
      additionalFiles: [{ path: 'references/missing.md', url: 'https://example.invalid/missing.md' }],
    }, TMP);

    expect(result).toMatchObject({ success: false, partial: true, downloadedFiles: 0, failedFiles: 1 });
    expect(result.fileOutcomes).toEqual([
      { path: 'references/missing.md', success: false, status: 'failed', error: 'HTTP 404' },
    ]);
    expect(fs.existsSync(path.join(result.path, 'SKILL.md'))).toBe(true);
  });

  it('reports path-traversal rejection as visible partial failure', async () => {
    const result = await mod.downloadSkill({
      name: 'rejected-file-skill', description: 'partial', content: 'instructions', metadata: {},
      additionalFiles: [{ path: '../../escape.md', url: 'https://example.invalid/escape.md' }],
    }, TMP);

    expect(result).toMatchObject({ success: false, partial: true, failedFiles: 1 });
    expect(result.fileOutcomes[0]).toMatchObject({ path: '../../escape.md', success: false, status: 'rejected' });
  });
});
