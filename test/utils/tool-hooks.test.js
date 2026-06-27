import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpHome;
let originalHome;
let hooks;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-hooks-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  delete require.cache[require.resolve('../../src/utils/tool-hooks')];
  hooks = require('../../src/utils/tool-hooks');
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

describe('tool-hooks', () => {
  describe('matchGlob', () => {
    it('matches exact strings', () => {
      expect(hooks.matchGlob('hello', 'hello')).toBe(true);
    });

    it('matches single wildcard', () => {
      expect(hooks.matchGlob('git push', 'git *')).toBe(true);
      expect(hooks.matchGlob('git commit -m "x"', 'git *')).toBe(true);
    });

    it('rejects non-matching wildcard', () => {
      expect(hooks.matchGlob('npm install', 'git *')).toBe(false);
    });

    it('matches double-star', () => {
      expect(hooks.matchGlob('src/foo/bar.js', 'src/**')).toBe(true);
      expect(hooks.matchGlob('src/foo.js', 'src/**')).toBe(true);
    });

    it('matches star alone for anything', () => {
      expect(hooks.matchGlob('anything at all', '*')).toBe(true);
    });
  });

  describe('matchRule', () => {
    const bashGit = { toolName: 'Bash', glob: 'git *', action: 'allow', raw: 'Bash(git *)' };

    it('matches Bash with git command', () => {
      expect(hooks.matchRule(bashGit, 'Bash', { command: 'git push' })).toBe(true);
    });

    it('rejects Bash with non-git command', () => {
      expect(hooks.matchRule(bashGit, 'Bash', { command: 'npm install' })).toBe(false);
    });

    it('rejects non-Bash tool', () => {
      expect(hooks.matchRule(bashGit, 'Read', { filePath: 'foo' })).toBe(false);
    });

    it('matches Write with env file', () => {
      const deny = { toolName: 'Write', glob: '**/.env*', action: 'deny', raw: 'Write(**/.env*)' };
      expect(hooks.matchRule(deny, 'Write', { filePath: '/path/.env' })).toBe(true);
      expect(hooks.matchRule(deny, 'Write', { filePath: 'src/main.js' })).toBe(false);
    });
  });

  describe('checkPreHooks', () => {
    it('returns allow when no rules match', () => {
      const result = hooks.checkPreHooks('Bash', { command: 'echo hi' });
      expect(result.action).toBe('allow');
      expect(result.rule).toBeNull();
    });

    it('returns deny when a deny rule matches', () => {
      const cfgPath = path.join(tmpHome, '.natureco');
      fs.mkdirSync(cfgPath, { recursive: true });
      fs.writeFileSync(path.join(cfgPath, 'config.json'), JSON.stringify({
        toolHooks: {
          pre: { 'Bash(rm *)': 'deny' },
        },
      }));
      delete require.cache[require.resolve('../../src/utils/tool-hooks')];
      hooks = require('../../src/utils/tool-hooks');
      const result = hooks.checkPreHooks('Bash', { command: 'rm -rf /' });
      expect(result.action).toBe('deny');
    });
  });

  describe('loadRules', () => {
    it('returns empty rules when no config', () => {
      const rules = hooks.loadRules();
      expect(rules.pre).toEqual([]);
      expect(rules.post).toEqual([]);
    });

    it('loads rules from config', () => {
      const cfgPath = path.join(tmpHome, '.natureco');
      fs.mkdirSync(cfgPath, { recursive: true });
      fs.writeFileSync(path.join(cfgPath, 'config.json'), JSON.stringify({
        toolHooks: {
          pre: { 'Bash(git *)': 'allow', 'Write(.env*)': 'deny' },
          post: { 'Bash(npm publish)': 'notify' },
        },
      }));
      delete require.cache[require.resolve('../../src/utils/tool-hooks')];
      hooks = require('../../src/utils/tool-hooks');
      const rules = hooks.loadRules();
      expect(rules.pre).toHaveLength(2);
      expect(rules.post).toHaveLength(1);
    });
  });
});
