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

function outputOf(spy) {
  return spy.mock.calls.flat().map(String).join('\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../../src/utils/config.js');
  vi.doUnmock('child_process');
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('AUDIT_FINDINGS_3 high-severity regressions', () => {
  it('H-01 uses the shared 0700/0600 writer at every secret-bearing command write site', async () => {
    const home = tempHome('natureco-h01-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync');
    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const chmodSpy = vi.spyOn(fs, 'chmodSync');
    const config = await import('../../src/utils/config.js');
    const proofFile = path.join(home, 'private', 'proof.json');

    config.writePrivateFile(proofFile, '{"token":"fake-secret"}');

    expect(mkdirSpy).toHaveBeenCalledWith(path.dirname(proofFile), { recursive: true, mode: 0o700 });
    expect(writeSpy).toHaveBeenCalledWith(proofFile, '{"token":"fake-secret"}', { encoding: 'utf8', mode: 0o600 });
    expect(chmodSpy).toHaveBeenCalledWith(proofFile, 0o600);

    const requiredCalls = new Map([
      ['setup.js', 2],
      ['configure.js', 1],
      ['backup.js', 1],
      ['onboard.js', 1],
    ]);
    for (const [file, count] of requiredCalls) {
      const source = fs.readFileSync(path.join(repoRoot, 'src', 'commands', file), 'utf8');
      expect(source.match(/writePrivateFile\(/g)?.length, file).toBe(count);
    }
    const backupSource = fs.readFileSync(path.join(repoRoot, 'src', 'commands', 'backup.js'), 'utf8');
    expect(backupSource).toContain('mode: 0o700');
    expect(backupSource).toContain('fs.chmodSync(backupDir, 0o700)');
    expect(backupSource).toContain('fs.chmodSync(backupFile, 0o600)');
  });

  it('H-02 masks config confirmations and every listed channel token display', async () => {
    const home = tempHome('natureco-h02-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const configUtils = await import('../../src/utils/config.js');
    const secrets = {
      discordToken: 'dis-12345678901234567890-cord',
      slackToken: 'sla-12345678901234567890-ack',
      telegramToken: 'tel-12345678901234567890-ram',
      mattermostToken: 'mat-12345678901234567890-ost',
    };
    configUtils.saveConfig({
      ...secrets,
      discordBotId: 'd1', slackBotId: 's1', telegramBotId: 't1',
      telegramAllowedChats: ['1'], mattermostBotId: 'm1', mattermostBaseUrl: 'https://example.invalid',
    }, { skipBackup: true, skipValidation: true });

    const configCommand = (await import('../../src/commands/config.js')).default;
    configCommand(['set', 'privateKey', 'cfg-12345678901234567890-key']);
    const adminRpc = (await import('../../src/commands/admin-rpc.js')).default;
    await adminRpc(['call', 'config.set', JSON.stringify({ key: 'webhookSecret', value: 'rpc-12345678901234567890-ret' })]);
    const discord = (await import('../../src/commands/discord.js')).default;
    const slack = (await import('../../src/commands/slack.js')).default;
    const telegram = (await import('../../src/commands/telegram.js')).default;
    const mattermost = (await import('../../src/commands/mattermost.js')).default;
    await discord('status'); await slack('status'); await telegram('status'); await mattermost('status');

    const output = outputOf(log);
    expect(output).toContain('privateKey = •••• saved');
    expect(output).toContain('config.webhookSecret = •••• saved');
    for (const value of Object.values(secrets)) expect(output).not.toContain(value);
    expect(output).not.toContain('cfg-12345678901234567890-key');
    expect(output).not.toContain('rpc-12345678901234567890-ret');
    expect(output).toContain('dis****ord');
    expect(output).toContain('sla****ack');
    expect(output).toContain('tel****ram');
    expect(output).toContain('mat****ost');

    const { maskToken } = await import('../../src/commands/channel-helper.js');
    expect(maskToken('hel-12345678901234567890-per')).toBe('hel****per');
  });

  it('H-02 never prints the admin bearer token when the real server starts', async () => {
    const home = tempHome('natureco-admin-token-');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adminRpc = (await import('../../src/commands/admin-rpc.js')).default;
    const port = String(42000 + Math.floor(Math.random() * 10000));
    adminRpc.startAdmin(port);
    await new Promise(resolve => setTimeout(resolve, 50));
    const token = fs.readFileSync(path.join(home, '.natureco', 'admin-token'), 'utf8').trim();
    const output = outputOf(log);
    expect(output).toContain('value hidden');
    expect(output).toContain('<token-from-file>');
    expect(output).not.toContain(token);
    adminRpc.stopAdmin();
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  it('H-03 passes a metacharacter-bearing iMessage path literally to execFileSync', async () => {
    const home = tempHome('natureco-h03-');
    const maliciousPath = path.join(home, 'imsg$(touch PWNED)');
    fs.writeFileSync(maliciousPath, 'not executed');
    const execFileSync = vi.fn(() => 'imsg test version\n');

    const imessage = (await import('../../src/commands/imessage.js')).default;
    expect(imessage.probeImsgBinary(maliciousPath, execFileSync)).toBe('imsg test version\n');

    expect(execFileSync).toHaveBeenCalledWith(maliciousPath, ['--help'], {
      encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(fs.existsSync(path.join(home, 'PWNED'))).toBe(false);
  });

  it('H-04 exits non-zero for unreachable send and kick while retaining audit JSONL', () => {
    const home = tempHome('natureco-h04-');
    const configDir = path.join(home, '.natureco');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ discordBotId: 'configured' }));
    const env = { ...process.env, HOME: home, USERPROFILE: home, FORCE_COLOR: '0' };
    const invoke = args => spawnSync(process.execPath, [
      '-e', `require('./src/commands/message')(${JSON.stringify(args)})`,
    ], { cwd: repoRoot, env, encoding: 'utf8' });

    const send = invoke(['send', '--channel', 'discord', '--target', 'fake-target', '--message', 'proof-message']);
    expect(send.status).toBe(1);
    expect(send.stdout + send.stderr).toContain('Message dispatch failed');
    expect(send.stdout + send.stderr).toContain('no retry was queued');
    expect(send.stdout + send.stderr).not.toContain('logged for later dispatch');

    const kick = invoke(['kick', 'discord', 'fake-user']);
    expect(kick.status).toBe(1);
    expect(kick.stdout + kick.stderr).toContain('Kick failed');
    expect(kick.stdout + kick.stderr).toContain('no retry was queued');
    expect(kick.stdout + kick.stderr).not.toContain('kicked from');

    const history = fs.readFileSync(path.join(configDir, 'messages.jsonl'), 'utf8');
    const moderation = fs.readFileSync(path.join(configDir, 'moderation.jsonl'), 'utf8');
    expect(history).toContain('"dispatched":false');
    expect(history).toContain('proof-message');
    expect(moderation).toContain('"action":"kick"');
    expect(moderation).toContain('fake-user');
  });
});
