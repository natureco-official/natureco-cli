import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpHome;
let originalHome;
let perms;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-perms-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  delete require.cache[require.resolve('../../src/utils/permissions')];
  delete require.cache[require.resolve('../../src/utils/tool-hooks')];
  perms = require('../../src/utils/permissions');
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

function writeConfig(permissions) {
  const cfgDir = path.join(tmpHome, '.natureco');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ permissions }));
}

describe('permissions', () => {
  describe('checkPermission', () => {
    it('returns allow when no rules exist', () => {
      const result = perms.checkPermission('Bash', { command: 'echo hi' });
      expect(result.action).toBe('allow');
    });

    it('denies by tool+pattern match', () => {
      writeConfig({ 'Read(~/.ssh/**)': 'deny' });
      delete require.cache[require.resolve('../../src/utils/permissions')];
      delete require.cache[require.resolve('../../src/utils/tool-hooks')];
      perms = require('../../src/utils/permissions');
      const result = perms.checkPermission('Read', { filePath: '~/.ssh/id_rsa' });
      expect(result.action).toBe('deny');
    });

    it('allows non-matching tool', () => {
      writeConfig({ 'Read(~/.ssh/**)': 'deny' });
      delete require.cache[require.resolve('../../src/utils/permissions')];
      perms = require('../../src/utils/permissions');
      const result = perms.checkPermission('Bash', { command: 'echo ok' });
      expect(result.action).toBe('allow');
    });

    it('handles string action value', () => {
      writeConfig({ 'Bash(git *)': 'allow', 'Bash(rm *)': 'deny' });
      delete require.cache[require.resolve('../../src/utils/permissions')];
      perms = require('../../src/utils/permissions');
      expect(perms.checkPermission('Bash', { command: 'git push' }).action).toBe('allow');
      expect(perms.checkPermission('Bash', { command: 'rm -rf /' }).action).toBe('deny');
    });

    it('handles object action with reason', () => {
      writeConfig({ 'Edit(.env*)': { action: 'deny', reason: 'Sensitive file' } });
      delete require.cache[require.resolve('../../src/utils/permissions')];
      perms = require('../../src/utils/permissions');
      const result = perms.checkPermission('Edit', { filePath: '.env' });
      expect(result.action).toBe('deny');
      expect(result.reason).toContain('Sensitive file');
    });

    it('asks for ask action', () => {
      writeConfig({ 'Bash(npm *)': 'ask' });
      delete require.cache[require.resolve('../../src/utils/permissions')];
      perms = require('../../src/utils/permissions');
      const result = perms.checkPermission('Bash', { command: 'npm publish' });
      expect(result.action).toBe('ask');
    });
  });

  describe('isApproved / markApproved', () => {
    it('returns false for unknown key', () => {
      expect(perms.isApproved('unknown')).toBe(false);
    });

    it('returns true after session mark', () => {
      perms.markApproved('test-key', false);
      expect(perms.isApproved('test-key')).toBe(true);
    });

    it('persists to disk when persistent=true', () => {
      perms.markApproved('persist-key', true);
      // reload module to clear session cache
      delete require.cache[require.resolve('../../src/utils/permissions')];
      perms = require('../../src/utils/permissions');
      expect(perms.isApproved('persist-key')).toBe(true);
    });
  });

  describe('formatPermissionPrompt', () => {
    it('formats tool call for display', () => {
      const str = perms.formatPermissionPrompt('Write', { filePath: '/.env', content: 'SECRET=1' }, 'reason');
      expect(str).toContain('Write');
      expect(str).toContain('/.env');
    });
  });
});
