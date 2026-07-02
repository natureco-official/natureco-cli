import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

const COMMANDS_DIR = path.resolve(__dirname, '../src/commands');
const BIN_PATH = path.resolve(__dirname, '../bin/natureco.js');

describe('regression: all commands', () => {
  const commandFiles = fs.readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  it('bin/natureco.js passes syntax check', () => {
    const result = require('child_process').execSync(
      `node --check "${BIN_PATH}"`,
      { encoding: 'utf8', timeout: 30000 }
    );
    expect(result).toBe('');
  });

  it('all command files pass syntax check', () => {
    // Tek node süreciyle toplu kontrol — dosya başına 5sn'lik execSync,
    // paralel test yükü altında (bilhassa Windows'ta) timeout'a düşüyordu
    const script =
      'const cp = require("child_process");' +
      'for (const f of process.argv.slice(1)) {' +
      '  cp.execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });' +
      '}' +
      'console.log("OK");';
    const filePaths = commandFiles.map(f => path.join(COMMANDS_DIR, f));
    const result = require('child_process').execFileSync(
      process.execPath, ['-e', script, ...filePaths],
      { encoding: 'utf8', timeout: 180000 }
    );
    expect(result.trim()).toBe('OK');
  }, 240000);

  it('all command modules can be required without error', () => {
    for (const file of commandFiles) {
      const filePath = path.join(COMMANDS_DIR, file);
      expect(() => require(filePath)).not.toThrow();
    }
  });

  it('natureco --help renders without error', () => {
    const result = require('child_process').execSync(
      `node "${BIN_PATH}" --help`,
      { encoding: 'utf8', timeout: 60000 }
    );
    expect(result).toContain('natureco');
    expect(result).toContain('chat');
    expect(result).toContain('agent');
    expect(result).toContain('completion');
    expect(result).toContain('sandbox');
  });

  it('all tool files can be required without error', () => {
    const toolsDir = path.resolve(__dirname, '../src/tools');
    const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));
    for (const file of toolFiles) {
      const filePath = path.join(toolsDir, file);
      expect(() => require(filePath)).not.toThrow();
    }
  });
});

describe('regression: subcommand --help', () => {
  const keyCommands = [
    'agent',
    'approvals',
    'backup',
    'capability',
    'commitments',
    'completion',
    'configure',
    'crestodian',
    'daemon',
    'devices',
    'directory',
    'dns',
    'docs',
    'exec-policy',
    'health',
    'infer',
    'node',
    'nodes',
    'onboard',
    'proxy',
    'qr',
    'sandbox',
    'secrets',
    'system',
    'terminal',
    'transcripts',
    'chat',
    'code',
    'voice',
    'clickclack',
    'memory',
    'plugins',
    'skills',
    'mcp',
    'clawbot',
    'dashboard',
    'doctor',
    'hooks',
    'logs',
    'pairing',
    'path',
    'reset',
    'sessions',
    'setup',
    'status',
    'tui',
    'uninstall',
    'update',
    'webhooks',
  ];

  for (const cmd of keyCommands) {
    it(`natureco ${cmd} --help works`, () => {
      const result = require('child_process').execSync(
        `node "${BIN_PATH}" ${cmd} --help`,
        { encoding: 'utf8', timeout: 60000, stdio: 'pipe' }
      );
      expect(result).toBeTruthy();
    });
  }
});

describe('regression: utils', () => {
  it('config utility loads', () => {
    const config = require('../src/utils/config');
    expect(config).toBeDefined();
    expect(typeof config.getConfig).toBe('function');
  });

  it('all util files pass syntax check', () => {
    const utilsDir = path.resolve(__dirname, '../src/utils');
    const utilFiles = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));
    for (const file of utilFiles) {
      const filePath = path.join(utilsDir, file);
      const result = require('child_process').execSync(
        `node --check "${filePath}"`,
        { encoding: 'utf8', timeout: 30000 }
      );
      expect(result).toBe('');
    }
  });
});
