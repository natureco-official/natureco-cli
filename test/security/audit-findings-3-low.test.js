import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadToolManifest } from '../../src/utils/tool-manifest.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const tempPaths = [];

function tempHome(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function runNode(args, home) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, FORCE_COLOR: '0', NATURECO_LANG: 'en' },
    encoding: 'utf8',
    timeout: 15000,
  });
}

function cli(args, home) {
  return runNode([path.join(repoRoot, 'bin', 'natureco.js'), ...args], home);
}

afterEach(() => {
  for (const target of tempPaths.splice(0)) fs.rmSync(target, { recursive: true, force: true });
});

describe('AUDIT_FINDINGS_3 low-severity regressions', () => {
  const noArgCases = [
    ['agent', 'Usage: natureco agent'],
    ['config', 'Usage: natureco config'],
    ['crestodian', 'Crestodian'],
    ['docs', 'NatureCo Docs Search'],
    ['message', 'Usage: message send'],
    ['migrate', 'OpenClaw directory not found'],
    ['repl', 'Provider not configured'],
    ['security', 'Security Audit'],
    ['skills', 'Skills'],
    ['tools', 'Total:'],
  ];

  it.each(noArgCases)('L-01 %s handles a direct no-argument call cleanly', (command, cleanMessage) => {
    const home = tempHome(`natureco-l01-${command}-`);
    const modulePath = path.join(repoRoot, 'src', 'commands', `${command}.js`);
    const script = 'Promise.resolve(require(process.argv[1])()).catch(error => { console.error(error); process.exitCode = 1; });';
    const result = runNode(['-e', script, modulePath], home);
    const output = result.stdout + result.stderr;

    expect(result.error).toBeUndefined();
    expect(output).toContain(cleanMessage);
    expect(output).not.toMatch(/TypeError|Cannot read properties of undefined/);
    console.log(`[L-01 proof] ${command}: exit=${result.status}; clean=${JSON.stringify(cleanMessage)}`);
  });

  it('L-02 dead command modules are absent and registrations target their live replacements', () => {
    for (const file of ['acp.js', 'memory.js', 'tui.js']) {
      expect(fs.existsSync(path.join(repoRoot, 'src', 'commands', file))).toBe(false);
    }
    const bin = fs.readFileSync(path.join(repoRoot, 'bin', 'natureco.js'), 'utf8');
    expect(bin).toContain(".command('acp [file]')");
    expect(bin).toContain("require('../src/commands/code')");
    expect(bin).toContain(".command('memory [action] [params...]')");
    expect(bin).toContain("require('../src/commands/memory-cmd')");
    expect(bin).not.toMatch(/commands\/(?:acp|memory|tui)(?:\.js)?['"]/);
    console.log('[L-02 proof] acp.js, memory.js, tui.js absent; acp -> code.js; memory -> memory-cmd.js');
  });

  const commandActions = {
    security: ['audit', 'allowlist', 'policy', 'secrets'],
    directory: ['self', 'peers', 'search', 'register', 'remove', 'groups'],
    nodes: ['list', 'pair', 'approve', 'reject', 'remove', 'rename', 'status', 'describe', 'invoke', 'notify', 'push', 'canvas', 'camera', 'screen', 'location'],
    sandbox: ['list', 'create', 'destroy', 'exec'],
    webhooks: ['list', 'gmail setup', 'gmail run'],
  };

  it.each(Object.entries(commandActions))('L-03 %s help matches its implemented actions', (command, actions) => {
    const home = tempHome(`natureco-l03-${command}-`);
    const result = cli([command, '--help'], home);
    const output = result.stdout + result.stderr;
    const expected = actions.join('|');
    const implementation = fs.readFileSync(path.join(repoRoot, 'src', 'commands', `${command}.js`), 'utf8');

    expect(result.status).toBe(0);
    for (const action of actions.flatMap(value => value.split(' '))) {
      expect(implementation).toContain(`'${action}'`);
    }
    expect(output).toContain(`(${expected})`);
    console.log(`[L-03 proof] ${command}: implementation=${expected}; help=${expected}`);
  });

  it('L-03 code help reports the current manifest tool count', () => {
    const home = tempHome('natureco-l03-code-');
    const count = loadToolManifest({ refresh: true }).size;
    const result = cli(['code', '--help'], home);
    const output = result.stdout + result.stderr;
    const normalizedOutput = output.replace(/\s+/g, ' ');

    expect(count).toBe(91);
    expect(result.status).toBe(0);
    expect(normalizedOutput).toContain(`(${count} tools, TUI, auto tool selection)`);
    console.log(`[L-03 proof] code: manifest=${count}; help=${count} tools`);
  });

  it('L-04 rejects a traversal sandbox name without creating outside the sandbox root', () => {
    const home = tempHome('natureco-l04-');
    const escapedName = `natureco-l04-escape-${process.pid}-${Date.now()}`;
    const traversalName = `../${escapedName}`;
    const escapedDir = path.join(os.tmpdir(), escapedName);
    tempPaths.push(escapedDir);

    expect(fs.existsSync(escapedDir)).toBe(false);
    const result = cli(['sandbox', 'create', traversalName], home);
    const output = result.stdout + result.stderr;
    expect(result.error).toBeUndefined();
    expect(output).toContain('Invalid sandbox name');
    expect(fs.existsSync(escapedDir)).toBe(false);
    console.log(`[L-04 proof] name=${traversalName}; rejected=true; escapedPathExists=false`);
  });
});
