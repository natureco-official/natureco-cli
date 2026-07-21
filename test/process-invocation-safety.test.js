import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(() => ''),
  execSync: vi.fn(() => ''),
  spawn: vi.fn(),
  getConfig: vi.fn(() => ({})),
  loadConfig: vi.fn(() => ({})),
  saveConfig: vi.fn(),
}));

const requireCjs = createRequire(import.meta.url);
const realExecFileSync = requireCjs('child_process').execFileSync;

function successfulChild() {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => child.emit('close', 0));
  return child;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.execFileSync.mockReturnValue('');
  mocks.execSync.mockReturnValue('');
  mocks.getConfig.mockReturnValue({});
  mocks.loadConfig.mockReturnValue({});
  const childProcess = requireCjs('child_process');
  vi.spyOn(childProcess, 'execFileSync').mockImplementation(mocks.execFileSync);
  vi.spyOn(childProcess, 'execSync').mockImplementation(mocks.execSync);
  vi.spyOn(childProcess, 'spawn').mockImplementation(mocks.spawn);
  const config = requireCjs('../src/utils/config.js');
  vi.spyOn(config, 'getConfig').mockImplementation(mocks.getConfig);
  vi.spyOn(config, 'getAllConfig').mockImplementation(mocks.getConfig);
  vi.spyOn(config, 'loadConfig').mockImplementation(mocks.loadConfig);
  vi.spyOn(config, 'saveConfig').mockImplementation(mocks.saveConfig);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('1. google_meet structured invocation', () => {
  it('opens a normal HTTPS Meet URL as one launcher argument', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const meet = (await import('../src/tools/google_meet.js')).default;
    const url = 'https://meet.google.com/abc-defg-hij';
    expect(await meet.execute({ action: 'open', meetingUrl: url })).toMatchObject({ success: true, meetingUrl: url });
    expect(mocks.execFileSync).toHaveBeenCalledWith('xdg-open', [url], { timeout: 5000 });
  });

  it('passes hostile title literally to osascript and rejects a non-HTTPS launcher URL', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('darwin');
    mocks.execFileSync.mockReturnValue(Buffer.from('https://meet.google.com/new\n'));
    const meet = (await import('../src/tools/google_meet.js')).default;
    const title = 'Review "Q1"; do shell script "touch /tmp/pwn"';
    const result = await meet.execute({ action: 'create', title, durationMinutes: 45 });
    expect(result.success).toBe(true);
    const [program, args, options] = mocks.execFileSync.mock.calls[0];
    expect(program).toBe('osascript');
    expect(args.slice(-2)).toEqual([title, '2700']);
    expect(options.input).not.toContain(title);

    mocks.execFileSync.mockClear();
    expect(await meet.execute({ action: 'open', meetingUrl: 'file:///tmp/x;touch-pwn' })).toMatchObject({ success: false });
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });
});

describe('2. text_to_speech fixed Python source', () => {
  it('passes normal text, voice, and output path as Python argv data', async () => {
    mocks.spawn.mockImplementation(successfulChild);
    const tts = (await import('../src/tools/text_to_speech.js')).default;
    const result = await tts.execute({ text: 'Merhaba dunya', provider: 'edge', voice: 'tr-TR-EmelNeural', savePath: 'speech.mp3' });
    expect(result).toMatchObject({ success: true, path: 'speech.mp3' });
    const [program, args] = mocks.spawn.mock.calls[0];
    expect(program).toBe('python3');
    expect(args.slice(-3)).toEqual(['Merhaba dunya', 'tr-TR-EmelNeural', 'speech.mp3']);
  });

  it('keeps quotes and Python/shell metacharacters out of the fixed source', async () => {
    mocks.spawn.mockImplementation(successfulChild);
    const tts = (await import('../src/tools/text_to_speech.js')).default;
    const text = '\"\"\"); __import__(\"os\").system(\"touch pwn\"); # $(whoami)';
    const voice = 'voice\";raise SystemExit';
    const output = 'dir with spaces/out\";pwn.mp3';
    expect((await tts.execute({ text, provider: 'edge', voice, savePath: output })).success).toBe(true);
    const args = mocks.spawn.mock.calls[0][1];
    expect(args[2]).toBe(text);
    expect(args[3]).toBe(voice);
    expect(args[4]).toBe(output);
    expect(args[1]).not.toContain(text);
    expect(args[1]).not.toContain(voice);
    expect(args[1]).not.toContain(output);
  });
});

describe('3. imessage argument arrays', () => {
  it('sends a normal recipient and message with execFileSync argv', async () => {
    mocks.getConfig.mockReturnValue({ imessageCliPath: 'C:/Program Files/imsg.exe' });
    const oldArgv = process.argv;
    process.argv = ['node', 'natureco', 'send', 'alice@example.com', 'hello', 'world'];
    try {
      const imessage = (await import('../src/commands/imessage.js')).default;
      expect((await imessage('send', 'alice@example.com', 'hello world')).success).toBe(true);
      expect(mocks.execFileSync).toHaveBeenCalledWith('C:/Program Files/imsg.exe', ['send', '--to', 'alice@example.com', '--text', 'hello world'], { encoding: 'utf8', timeout: 30000 });
    } finally {
      process.argv = oldArgv;
    }
  });

  it('passes recipient/message shell metacharacters as literal argv values', async () => {
    mocks.getConfig.mockReturnValue({ imessageCliPath: 'C:/Program Files/imsg.exe' });
    const recipient = 'a\"; touch pwn; #@example.com';
    const message = 'hello \"quoted\" && $(touch pwn)';
    const oldArgv = process.argv;
    process.argv = ['node', 'natureco', recipient, message];
    try {
      const imessage = (await import('../src/commands/imessage.js')).default;
      expect((await imessage('send', recipient, message)).success).toBe(true);
      expect(mocks.execFileSync.mock.calls[0][1]).toEqual(['send', '--to', recipient, '--text', message]);
    } finally {
      process.argv = oldArgv;
    }
  });
});

describe('4. skill binary requirement validation', () => {
  it('probes a normal executable token with --version argv', async () => {
    const skills = (await import('../src/utils/skills.js')).default;
    const metadata = { metadata: { natureco: { requires: { bins: ['node'] } } } };
    expect(skills.checkSkillRequirements(metadata)).toEqual([]);
    expect(mocks.execFileSync).toHaveBeenCalledWith('node', ['--version'], { stdio: 'ignore' });
  });

  it('rejects skill binary metadata containing shell syntax or paths', async () => {
    const skills = (await import('../src/utils/skills.js')).default;
    const metadata = { metadata: { natureco: { requires: { bins: ['node; touch pwn', '../node', 'node --eval'] } } } };
    expect(skills.checkSkillRequirements(metadata)).toEqual([
      'Binary gerekli: node; touch pwn',
      'Binary gerekli: ../node',
      'Binary gerekli: node --eval',
    ]);
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });
});

describe('5. MCP command probing', () => {
  it('probes a normal configured MCP command as program plus argv', async () => {
    mocks.loadConfig.mockReturnValue({ mcpServers: { demo: { command: 'npx', args: ['server-package'] } } });
    const mcp = (await import('../src/utils/mcp.js')).default;
    expect(mcp.testMcpServer('demo')).toBe(true);
    expect(mocks.execFileSync).toHaveBeenCalledWith('npx', ['--version'], { stdio: 'ignore' });
  });

  it('passes an operator command containing metacharacters as one literal executable path', async () => {
    mocks.loadConfig.mockReturnValue({ mcpServers: { demo: { command: 'node ;touch-pwn', args: [] } } });
    const mcp = (await import('../src/utils/mcp.js')).default;
    expect(mcp.testMcpServer('demo')).toBe(true);
    expect(mocks.execFileSync).toHaveBeenCalledWith('node ;touch-pwn', ['--version'], { stdio: 'ignore' });
  });
});

describe('6. worktree identifier validation and Git argv', () => {
  it('creates a normal Git worktree using explicit Git arguments', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-safe-wt-'));
    const oldCwd = process.cwd();
    process.chdir(tmp);
    try {
      realExecFileSync('git', ['init', '--quiet'], { cwd: tmp });
      fs.writeFileSync(path.join(tmp, 'README.md'), 'test repository\n');
      realExecFileSync('git', ['add', 'README.md'], { cwd: tmp });
      realExecFileSync('git', ['-c', 'user.name=NatureCo Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'initial'], { cwd: tmp });
      mocks.execFileSync.mockImplementation(realExecFileSync);
      const { Worktree } = await import('../src/utils/worktree.js');
      const wt = new Worktree();
      const result = wt.enter({ id: 'feature-1', branch: 'wt/feature-1' });
      expect(result.error).toBeUndefined();
      expect(wt.active.strategy).toBe('git-worktree');
      expect(mocks.execFileSync).toHaveBeenCalledWith('git', ['branch', '-f', 'wt/feature-1', 'HEAD'], expect.any(Object));
      expect(mocks.execFileSync).toHaveBeenCalledWith('git', ['worktree', 'add', '--detach', expect.stringContaining('feature-1'), 'wt/feature-1'], expect.any(Object));
      wt.exit({ merge: false });
    } finally {
      process.chdir(oldCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects model-provided IDs/branches with spaces or shell metacharacters before Git', async () => {
    const { Worktree } = await import('../src/utils/worktree.js');
    const wt = new Worktree();
    wt._mockGitRepo = true;
    expect(wt.enter({ id: 'bad; touch pwn' })).toMatchObject({ error: expect.any(String) });
    expect(wt.enter({ id: 'safe-id', branch: 'wt/good && touch pwn' })).toMatchObject({ error: expect.any(String) });
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });
});

describe('7. clickclack speech data handling', () => {
  it('passes normal macOS speech text as one say argument', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const clickclack = (await import('../src/commands/clickclack.js')).default;
    clickclack.speak('Build complete');
    expect(mocks.execFileSync).toHaveBeenCalledWith('say', ['Build complete'], { stdio: 'ignore' });
  });

  it('passes hostile Windows speech text only through stdin', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const clickclack = (await import('../src/commands/clickclack.js')).default;
    const text = '\"); Remove-Item C:\\\\important; $(whoami); #';
    clickclack.speak(text);
    const [program, args, options] = mocks.execFileSync.mock.calls[0];
    expect(program).toBe('powershell');
    expect(args.join(' ')).not.toContain(text);
    expect(options.input).toBe(text);
  });
});

describe('8. Signal CLI and HTTP probes', () => {
  it('probes a normal configured CLI path with --version argv', async () => {
    mocks.getConfig.mockReturnValue({ signalHttpUrl: 'http://127.0.0.1:8080', signalCliPath: process.execPath });
    vi.stubGlobal('fetch', vi.fn(async url => ({
      ok: String(url).includes('/api/v1/check'),
      status: 200,
      text: async () => 'ok',
      json: async () => ({}),
    })));
    mocks.execFileSync.mockReturnValue('signal-cli 1.0');
    const signal = (await import('../src/commands/signal.js')).default;
    await signal('probe');
    expect(mocks.execFileSync).toHaveBeenCalledWith(process.execPath, ['--version'], { encoding: 'utf-8', timeout: 10000 });
  });

  it('handles metacharacters in an HTTP URL as URL data without a process call', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = (await import('../src/commands/signal.js')).default;
    const baseUrl = 'http://127.0.0.1:8080/path%27;$env:PWN=1?x=$(whoami)';
    expect(await signal.probeHttp({ signalHttpUrl: baseUrl })).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ signal: expect.anything() }));
    expect(mocks.execFileSync).not.toHaveBeenCalled();
    expect(mocks.execSync).not.toHaveBeenCalled();
  });
});

describe('9. admin-rpc pure-Node log tail', () => {
  it('returns the requested final lines for normal input', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-log-tail-'));
    const logPath = path.join(tmp, 'gateway.log');
    fs.writeFileSync(logPath, 'one\ntwo\nthree\nfour\n');
    try {
      const admin = (await import('../src/commands/admin-rpc.js')).default;
      expect(admin.readLogTail(logPath, 2)).toBe('three\nfour');
      expect(admin.normalizeTailLines(50000)).toBe(1000);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('treats shell metacharacters as invalid line-count data and runs no process', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-log-tail-'));
    const logPath = path.join(tmp, 'gateway.log');
    fs.writeFileSync(logPath, Array.from({ length: 25 }, (_, i) => `line-${i + 1}`).join('\n'));
    try {
      const admin = (await import('../src/commands/admin-rpc.js')).default;
      expect(admin.normalizeTailLines('2; touch pwn')).toBe(20);
      expect(admin.readLogTail(logPath, '2; touch pwn').split('\n')).toHaveLength(20);
      expect(mocks.execFileSync).not.toHaveBeenCalled();
      expect(mocks.execSync).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('10. sandbox name validation and Docker argv', () => {
  it('removes a normal Docker sandbox name with explicit arguments', async () => {
    const sandbox = (await import('../src/commands/sandbox.js')).default;
    sandbox.destroySandbox('natureco-sandbox-1');
    expect(mocks.execFileSync).toHaveBeenCalledWith('docker', ['rm', '-f', 'natureco-sandbox-1'], { stdio: 'pipe', timeout: 10000 });
  });

  it('rejects a sandbox name containing spaces and shell metacharacters before Docker', async () => {
    const sandbox = (await import('../src/commands/sandbox.js')).default;
    expect(sandbox.destroySandbox('safe-name; docker rm -f victim')).toBe(false);
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });
});
