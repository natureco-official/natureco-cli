import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `natureco-approvals-test-${Date.now()}`);

describe('approvals', () => {
  let mod;

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    vi.resetModules();
    if (!fs.existsSync(TEST_HOME)) {
      fs.mkdirSync(TEST_HOME, { recursive: true });
    }
    vi.stubGlobal('process', {
      ...process,
      stdin: { resume: vi.fn() },
    });
    mod = require('../../src/utils/approvals');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('loadApprovals / saveApprovals', () => {
    it('should return default structure when no file', () => {
      const data = mod.loadApprovals();
      expect(data.version).toBe(1);
      expect(data.defaults).toEqual({ security: 'full', ask: 'off' });
      expect(data.agents).toEqual({});
    });

    it('should save and load data', () => {
      const testData = { version: 1, defaults: { security: 'allowlist', ask: 'on-miss' }, agents: {} };
      mod.saveApprovals(testData);
      const loaded = mod.loadApprovals();
      expect(loaded.defaults.security).toBe('allowlist');
    });

    it('should handle corrupted file', () => {
      const dir = path.dirname(mod.getApprovalsPath());
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(mod.getApprovalsPath(), '{corrupted}', 'utf8');
      const data = mod.loadApprovals();
      expect(data.version).toBe(1);
    });
  });

  describe('resolveEffectivePolicy', () => {
    it('should return defaults when no agentId', () => {
      const policy = mod.resolveEffectivePolicy(null);
      expect(policy.security).toBe('full');
      expect(policy.ask).toBe('off');
    });

    it('should return defaults when agent not in file', () => {
      const policy = mod.resolveEffectivePolicy('unknown-agent');
      expect(policy.security).toBe('full');
    });

    it('should merge agent settings with defaults', () => {
      mod.saveApprovals({
        version: 1,
        defaults: { security: 'allowlist', ask: 'on-miss' },
        agents: {
          'my-agent': { security: 'deny' },
        },
      });
      const policy = mod.resolveEffectivePolicy('my-agent');
      expect(policy.security).toBe('deny');
      expect(policy.ask).toBe('on-miss');
    });
  });

  describe('resolveMode', () => {
    it('deny security returns deny mode', () => {
      expect(mod.resolveMode('deny', 'off')).toBe('deny');
    });

    it('allowlist + always ask returns ask mode', () => {
      expect(mod.resolveMode('allowlist', 'always')).toBe('ask');
    });

    it('allowlist without always ask returns allowlist mode', () => {
      expect(mod.resolveMode('allowlist', 'off')).toBe('allowlist');
    });

    it('full returns full mode', () => {
      expect(mod.resolveMode('full', 'off')).toBe('full');
    });
  });

  describe('matchAllowlist', () => {
    const entries = [
      { id: '1', pattern: '^git\\s+' },
      { id: '2', pattern: '^npm\\s+install', argPattern: 'lodash' },
    ];

    it('should match command pattern', () => {
      const match = mod.matchAllowlist(entries, 'git status');
      expect(match).not.toBeNull();
      expect(match.id).toBe('1');
    });

    it('should match with argPattern', () => {
      const match = mod.matchAllowlist(entries, 'npm install lodash');
      expect(match).not.toBeNull();
      expect(match.id).toBe('2');
    });

    it('should reject when argPattern does not match', () => {
      const match = mod.matchAllowlist(entries, 'npm install express');
      expect(match).toBeNull();
    });

    it('should return null for non-matching command', () => {
      const match = mod.matchAllowlist(entries, 'rm -rf /');
      expect(match).toBeNull();
    });

    it('should return null for null inputs', () => {
      expect(mod.matchAllowlist(null, 'test')).toBeNull();
      expect(mod.matchAllowlist(entries, null)).toBeNull();
    });

    it('should handle invalid regex patterns gracefully', () => {
      const badEntries = [{ id: 'bad', pattern: '[invalid' }];
      const match = mod.matchAllowlist(badEntries, 'test');
      expect(match).toBeNull();
    });
  });

  describe('requiresApproval', () => {
    it('should deny when mode is deny', () => {
      const result = mod.requiresApproval({ command: 'rm -rf /', agentId: 'test', security: 'deny' });
      expect(result.required).toBe(true);
      expect(result.reason).toBe('deny');
    });

    it('should allow when mode is full', () => {
      const result = mod.requiresApproval({ command: 'any command', agentId: 'test', security: 'full' });
      expect(result.required).toBe(false);
      expect(result.reason).toBe('full');
    });

    it('should require approval when not in allowlist', () => {
      const result = mod.requiresApproval({ command: 'rm -rf /', agentId: 'test', security: 'allowlist' });
      expect(result.required).toBe(true);
      expect(result.reason).toBe('not-in-allowlist');
    });

    it('should allow when command is in allowlist', () => {
      mod.saveApprovals({
        version: 1,
        defaults: { security: 'allowlist', ask: 'on-miss' },
        agents: {
          test: { allowlist: [{ id: '1', pattern: '^rm\\s+' }] },
        },
      });
      const result = mod.requiresApproval({ command: 'rm -rf /', agentId: 'test', security: 'allowlist' });
      expect(result.required).toBe(false);
      expect(result.reason).toBe('allowlist');
    });
  });

  describe('isSafeCommand', () => {
    it('should mark ls as safe', () => {
      expect(mod.isSafeCommand('ls')).toBe(true);
    });

    it('should mark ls -la as safe', () => {
      expect(mod.isSafeCommand('ls -la')).toBe(true);
    });

    it('should not mark rm as safe', () => {
      expect(mod.isSafeCommand('rm -rf /')).toBe(false);
    });
  });

  describe('isDangerousCommand', () => {
    it('should detect rm -rf /', () => {
      expect(mod.isDangerousCommand('rm -rf /')).toBe(true);
    });

    it('should detect mkfs', () => {
      expect(mod.isDangerousCommand('mkfs.ext4 /dev/sda1')).toBe(true);
    });

    it('should detect dd to device', () => {
      expect(mod.isDangerousCommand('dd if=/dev/zero of=/dev/sda')).toBe(true);
    });

    it('should not flag a normal command', () => {
      expect(mod.isDangerousCommand('git push')).toBe(false);
    });
  });

  describe('addAllowlistEntry / listAllowlist / removeAllowlistEntry', () => {
    it('should add an entry for an agent', () => {
      mod.addAllowlistEntry('test-agent', 'npm test');
      const list = mod.listAllowlist('test-agent');
      expect(list.length).toBe(1);
      expect(list[0].pattern).toContain('npm test');
      expect(list[0].source).toBe('allow-always');
    });

    it('should list allowlist for non-existent agent', () => {
      const list = mod.listAllowlist('nobody');
      expect(list).toEqual([]);
    });

    it('should remove an entry by id', () => {
      mod.addAllowlistEntry('test-agent', 'npm test');
      const list = mod.listAllowlist('test-agent');
      const id = list[0].id;

      const removed = mod.removeAllowlistEntry('test-agent', id);
      expect(removed).toBe(true);
      expect(mod.listAllowlist('test-agent').length).toBe(0);
    });

    it('should return false when removing non-existent entry', () => {
      const result = mod.removeAllowlistEntry('test-agent', 'nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('setSecurityPolicy', () => {
    it('should set security and ask for an agent', () => {
      mod.setSecurityPolicy('test-agent', { security: 'deny', ask: 'off' });
      const policy = mod.resolveEffectivePolicy('test-agent');
      expect(policy.security).toBe('deny');
      expect(policy.ask).toBe('off');
    });
  });

  describe('getApprovalsPath', () => {
    it('should return correct path', () => {
      const p = mod.getApprovalsPath();
      expect(p).toContain('.natureco');
      expect(p).toContain('exec-approvals.json');
    });
  });
});
