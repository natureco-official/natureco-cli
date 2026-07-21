import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const tempDirs = [];

function tempHome(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function cli(args, home) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'bin', 'natureco.js'), ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, FORCE_COLOR: '0', NATURECO_LANG: 'en' },
    encoding: 'utf8',
    timeout: 10000,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('AUDIT_FINDINGS_3 medium-severity regressions', () => {
  it('M-01 passes a metacharacter path as literal df argv and reports measurement failure as unknown', async () => {
    const doctor = (await import('../../src/commands/doctor.js')).default;
    const maliciousPath = '/tmp/home $(touch PWNED); echo bad/.natureco';
    const execFile = vi.fn(() => 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000000 1 900000 1% /tmp\n');

    expect(doctor.measureDiskSpace(maliciousPath, 'linux', execFile)).toBeCloseTo(900000 / 1024 / 1024);
    expect(execFile).toHaveBeenCalledWith('df', ['-k', maliciousPath], { encoding: 'utf8' });

    const failed = doctor.runCheck('diskSpace', { platform: 'linux', execFile: () => { throw new Error('df failed'); } });
    expect(failed).toMatchObject({ pass: false, warning: true });
    expect(failed.message).toContain('df failed');
  });

  it('M-02 forwards backup and sandbox operands through real CLI parsing', () => {
    const home = tempHome('natureco-m02-');
    const backup = cli(['backup', 'restore', 'missing-proof.tar.gz'], home);
    expect(backup.status).toBe(1);
    expect(backup.stdout + backup.stderr).toContain('missing-proof.tar.gz');

    const name = `auditbox-${process.pid}-${Date.now()}`;
    const sandbox = cli(['sandbox', 'create', name], home);
    expect(sandbox.status).toBe(0);
    expect(sandbox.stdout + sandbox.stderr).toContain(`Sandbox created: ${name}`);
    const sandboxDir = path.join(os.tmpdir(), 'natureco-sandboxes', name);
    expect(JSON.parse(fs.readFileSync(path.join(sandboxDir, '.natureco-sandbox'), 'utf8')).name).toBe(name);
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('M-03 reports screenshot as an unimplemented CDP operation', async () => {
    const browser = (await import('../../src/commands/browser.js')).default;
    expect(browser(['screenshot'])).toEqual({
      success: false,
      error: 'Browser screenshot is not yet implemented (CDP transport unavailable)',
    });
  });

  it('M-04 reports invoke as an unimplemented node transport operation', async () => {
    const nodes = (await import('../../src/commands/nodes.js')).default;
    expect(nodes(['invoke', 'node-1', 'ping'])).toEqual({ success: false, error: 'Node invoke is not implemented' });
  });

  it('M-05 reports call as an unimplemented gateway RPC operation', async () => {
    const gateway = (await import('../../src/commands/gateway.js')).default;
    await expect(gateway('call', 'ping')).resolves.toEqual({
      success: false,
      error: 'Gateway call ping is not implemented',
    });
  });

  it('M-06 persists an honest not_implemented cron run record', async () => {
    const home = tempHome('natureco-m06-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const dir = path.join(home, '.natureco');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'crons.json'), JSON.stringify([{
      name: 'proof-job', schedule: '* * * * *', action: 'telegram', target: 'test', prompt: 'proof',
    }]));
    const cron = (await import('../../src/commands/cron.js')).default;
    await cron('run', { name: 'proof-job' });
    const runs = JSON.parse(fs.readFileSync(path.join(dir, 'cron-runs.json'), 'utf8'));
    expect(runs.at(-1)).toMatchObject({ name: 'proof-job', status: 'not_implemented' });
    expect(runs.at(-1).output).toContain('No run dispatched');
  });

  it('M-07 uses taskkill argv on Windows and process.kill SIGTERM on POSIX', async () => {
    const home = tempHome('natureco-m07-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const dir = path.join(home, '.natureco');
    const pidFile = path.join(dir, 'gateway.pid');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(pidFile, '4242');
    const daemon = (await import('../../src/commands/daemon.js')).default;
    const winKill = vi.fn();
    const execFile = vi.fn();
    // Pass 'win32' explicitly rather than relying on process.platform, so this assertion is
    // meaningful on every CI platform (macOS/Linux runners must exercise this branch too).
    expect(daemon.stopDaemon('win32', winKill, execFile)).toEqual({ success: true, pid: 4242 });
    expect(winKill).toHaveBeenCalledWith(4242, 0);
    expect(execFile).toHaveBeenCalledWith('taskkill', ['/F', '/PID', '4242'], { stdio: 'pipe' });

    fs.writeFileSync(pidFile, '4242');
    const posixKill = vi.fn();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(daemon.stopDaemon(undefined, posixKill, execFile)).toEqual({ success: true, pid: 4242 });
    expect(posixKill.mock.calls).toEqual([[4242, 0], [4242, 'SIGTERM']]);
  });

  it('M-08 returns a clean no-bot error directly and through the real acp CLI', async () => {
    const code = (await import('../../src/commands/code.js')).default;
    // getLang() falls back to Turkish by default with no config/env — force English so this
    // in-process assertion is deterministic regardless of the CI runner's environment.
    const { setLangCache } = await import('../../src/utils/i18n.js');
    setLangCache('en');
    expect(code.noBotSelected()).toEqual({
      success: false,
      error: 'No bot selected. Run `natureco bots` first.',
    });

    const home = tempHome('natureco-m08-');
    const acp = cli(['acp'], home);
    expect(acp.error).toBeUndefined();
    expect(acp.status).toBe(1);
    expect(acp.stdout + acp.stderr).toContain('No bot selected. Run `natureco bots` first.');
    expect(acp.stdout + acp.stderr).not.toContain("Cannot read properties of undefined");
  });
});
