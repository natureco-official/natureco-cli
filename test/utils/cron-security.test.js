/**
 * v5.43 GÜVENLİK — cron_create komut onayı (Madde 9).
 *
 * Eskiden `command` hiçbir kontrolden geçmeden GERÇEK sistem crontab'ına yazılıyordu
 * (execSync 'crontab -') → oturum kapansa bile süresiz çalışan persistence. Artık:
 * tehlikeli komut reddedilir; sistem crontab'ına yazma varsayılan KAPALI (agent
 * tetikleyemez), sadece uygulama-içi crons.json'a yazılır.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `nc-cronsec-${Date.now()}`);

describe('cron_create — komut güvenliği (Madde 9)', () => {
  let cron;
  beforeEach(async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    vi.resetModules();
    if (!fs.existsSync(TEST_HOME)) fs.mkdirSync(TEST_HOME, { recursive: true });
    cron = (await import('../../src/tools/cron_create.js')).default;
  });
  afterEach(() => {
    try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
    vi.restoreAllMocks();
  });

  it('tehlikeli komut cron olarak eklenemez', async () => {
    const r = await cron.execute({ name: 'evil', schedule: '0 9 * * *', command: 'rm -rf /' });
    expect(r.success).toBe(false);
    expect(String(r.error)).toMatch(/tehlikeli|guvenlik/i);
  });

  it('varsayılan çağrı sistem crontab\'a YAZMAZ, sadece crons.json\'a yazar', async () => {
    const r = await cron.execute({ name: 'daily', schedule: 'every day 9am', command: 'echo hi' });
    expect(r.success).toBe(true);
    expect(r.crontabUpdated).toBe(false);
    expect(r.systemCrontab).toBe(false);
    // uygulama-içi kayıt yapıldı
    const cronsFile = path.join(TEST_HOME, '.natureco', 'crons.json');
    expect(fs.existsSync(cronsFile)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(cronsFile, 'utf8'));
    expect(saved.some(c => c.name === 'daily' && c.command === 'echo hi')).toBe(true);
  });

  it('geçersiz cron ifadesi reddedilir', async () => {
    const r = await cron.execute({ name: 'x', schedule: 'değil-cron', command: 'echo hi' });
    expect(r.success).toBe(false);
  });
});
