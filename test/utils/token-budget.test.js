import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `natureco-token-budget-test-${Date.now()}`);

describe('token-budget', () => {
  let mod;

  beforeAll(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
  });

  beforeEach(() => {
    mod = require('../../src/utils/token-budget');

    [mod.BUDGET_FILE, mod.USAGE_FILE].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    mod.save({ preset: 'balanced', ...mod.PRESETS.balanced });
    if (fs.existsSync(mod.BUDGET_FILE)) fs.unlinkSync(mod.BUDGET_FILE);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('PRESETS', () => {
    it('should export 3 presets (efficient, balanced, quality)', () => {
      const keys = Object.keys(mod.PRESETS);
      expect(keys).toEqual(['efficient', 'balanced', 'quality']);
    });

    it('each preset should have maxContextTokens, tailTurns, toolMaxChars', () => {
      const fields = ['maxContextTokens', 'tailTurns', 'toolMaxChars'];
      for (const key of Object.keys(mod.PRESETS)) {
        for (const field of fields) {
          expect(mod.PRESETS[key]).toHaveProperty(field);
        }
      }
    });
  });

  describe('load/save', () => {
    it('should return balanced preset by default', () => {
      const budget = mod.load();
      expect(budget.maxContextTokens).toBe(16384);
      expect(budget.preset).toBe('balanced');
    });

    it('should save and reload custom values', () => {
      mod.save({ maxContextTokens: 999, preset: 'balanced' });
      const loaded = mod.load();
      expect(loaded.maxContextTokens).toBe(999);
    });

    it('should cache after first load', () => {
      const first = mod.load();
      expect(first.maxContextTokens).toBe(16384);

      fs.writeFileSync(mod.BUDGET_FILE, JSON.stringify({ maxContextTokens: 999 }), 'utf8');

      const second = mod.load();
      expect(second.maxContextTokens).toBe(16384);
    });
  });

  describe('setPreset', () => {
    it('should switch to efficient preset', () => {
      const result = mod.setPreset('efficient');
      expect(result).toBe(true);
      const budget = mod.load();
      expect(budget.maxContextTokens).toBe(8192);
    });

    it('should return false for invalid preset name', () => {
      const result = mod.setPreset('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getPresets', () => {
    it('should return array of 3 preset objects with key, label, maxContextTokens', () => {
      const presets = mod.getPresets();
      expect(presets).toHaveLength(3);
      presets.forEach(p => {
        expect(p).toHaveProperty('key');
        expect(p).toHaveProperty('label');
        expect(p).toHaveProperty('maxContextTokens');
      });
    });
  });

  describe('importanceScore', () => {
    it('should score system messages highest (100)', () => {
      const score = mod.importanceScore({ role: 'system', content: 'This is a long enough system message' });
      expect(score).toBeGreaterThanOrEqual(100);
    });

    it('should score tool messages negative (-20)', () => {
      const score = mod.importanceScore({ role: 'tool', content: 'result' });
      expect(score).toBeLessThan(0);
    });

    it('should score user messages 30', () => {
      const score = mod.importanceScore({ role: 'user', content: 'A sufficiently long message' });
      expect(score).toBe(30);
    });

    it('should score assistant messages with tool_calls 10', () => {
      const score = mod.importanceScore({ role: 'assistant', content: 'A sufficiently long message', tool_calls: [{ id: 'call_1' }] });
      expect(score).toBe(10);
    });

    it('should add bonus for long messages (>500 chars)', () => {
      const score = mod.importanceScore({ role: 'user', content: 'x'.repeat(600) });
      expect(score).toBe(35);
    });

    it('should penalize very short messages (<20 chars)', () => {
      const score = mod.importanceScore({ role: 'user', content: 'Hi' });
      expect(score).toBe(25);
    });
  });

  describe('smartTrim', () => {
    it('should keep all system messages', () => {
      mod.save({ maxContextTokens: 100, reservedTokens: 0, tailTurns: 0, conversationInContext: 0 });

      const messages = [
        { role: 'system', content: 'System 1' },
        { role: 'system', content: 'System 2' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ];
      const result = mod.smartTrim(messages);
      const systems = result.filter(m => m.role === 'system');
      expect(systems).toHaveLength(2);
    });

    it('should keep last tailTurns turns even if low scoring', () => {
      mod.save({ maxContextTokens: 1000, reservedTokens: 0, tailTurns: 2, conversationInContext: 0 });

      const messages = [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
        { role: 'user', content: 'C' },
        { role: 'assistant', content: 'D' },
        { role: 'user', content: 'E' },
        { role: 'assistant', content: 'F' },
      ];
      const result = mod.smartTrim(messages);
      const contents = result.map(m => m.content);
      expect(contents).toContain('C');
      expect(contents).toContain('D');
      expect(contents).toContain('E');
      expect(contents).toContain('F');
    });

    it('should remove lowest-scoring messages when over budget', () => {
      mod.save({ maxContextTokens: 100, reservedTokens: 0, tailTurns: 0, conversationInContext: 0 });

      const messages = [
        { role: 'user', content: 'a'.repeat(20) },
        { role: 'tool', content: 'b'.repeat(20) },
        { role: 'user', content: 'c'.repeat(600) },
        { role: 'assistant', content: 'd'.repeat(20) },
      ];
      const result = mod.smartTrim(messages);
      const toolMsg = result.find(m => m.role === 'tool');
      expect(toolMsg).toBeUndefined();
    });

    it('should return empty array for empty input', () => {
      const result = mod.smartTrim([]);
      expect(result).toEqual([]);
    });

    it('should return all messages if within budget', () => {
      mod.save({ maxContextTokens: 99999, reservedTokens: 0, tailTurns: 10, conversationInContext: 10 });

      const messages = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ];
      const result = mod.smartTrim(messages);
      expect(result).toHaveLength(2);
    });
  });

  describe('trimMessages', () => {
    it('should return messages unchanged if within conversationInContext limit', () => {
      mod.save({ ...mod.PRESETS.balanced, conversationInContext: 2, tailTurns: 1 });

      const messages = [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'A' },
      ];
      const result = mod.trimMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe('user');
    });

    it('should trim old messages and insert compaction note when over limit', () => {
      mod.save({ ...mod.PRESETS.balanced, conversationInContext: 2, tailTurns: 1 });

      const messages = [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
        { role: 'user', content: 'C' },
      ];
      const result = mod.trimMessages(messages);
      expect(result[0].role).toBe('system');
      expect(result[1].role).toBe('system');
      expect(result[1].content).toContain('compressed');
      expect(result[2].content).toBe('B');
      expect(result[3].content).toBe('C');
    });
  });

  describe('capToolOutput', () => {
    it('should truncate lines over toolMaxLines', () => {
      mod.save({ ...mod.PRESETS.balanced, toolMaxLines: 2, toolMaxChars: 99999 });

      const output = 'line1\nline2\nline3\nline4';
      const result = mod.capToolOutput(output);
      expect(result).toContain('2 more lines');
    });

    it('should truncate chars over toolMaxChars', () => {
      mod.save({ ...mod.PRESETS.balanced, toolMaxLines: 999, toolMaxChars: 10 });

      const output = 'abcdefghijklmnopqrstuvwxyz';
      const result = mod.capToolOutput(output);
      expect(result).toContain('truncated');
      expect(result).toMatch(/^abcdefghij\.\.\./);
    });

    it('should return original if under limits', () => {
      mod.save({ ...mod.PRESETS.balanced, toolMaxLines: 999, toolMaxChars: 99999 });

      const output = 'hello world';
      const result = mod.capToolOutput(output);
      expect(result).toBe('hello world');
    });
  });

  describe('trackUsage / getUsage', () => {
    it('should track token usage for a session', () => {
      mod.trackUsage('test-session', { input: 100, output: 50 });
      const usage = mod.getUsage('test-session');
      expect(usage).not.toBeNull();
      expect(usage.input).toBe(100);
      expect(usage.output).toBe(50);
      expect(usage.total).toBe(150);
      expect(usage.count).toBe(1);
    });

    it('should accumulate multiple tracking calls', () => {
      mod.trackUsage('accum-session', { input: 100, output: 50 });
      mod.trackUsage('accum-session', { input: 200, output: 100 });
      const usage = mod.getUsage('accum-session');
      expect(usage.input).toBe(300);
      expect(usage.output).toBe(150);
      expect(usage.total).toBe(450);
      expect(usage.count).toBe(2);
    });

    it('should return null for unknown session', () => {
      const usage = mod.getUsage('does-not-exist');
      expect(usage).toBeNull();
    });

    it('should return all usage when called without sessionId', () => {
      mod.trackUsage('all-session-a', { input: 10, output: 5 });
      mod.trackUsage('all-session-b', { input: 20, output: 10 });
      const all = mod.getUsage();
      expect(all['all-session-a']).toBeTruthy();
      expect(all['all-session-b']).toBeTruthy();
    });
  });

  describe('formatUsage', () => {
    it('should format usage with all fields', () => {
      const result = mod.formatUsage({ total: 300, input: 200, output: 100, count: 5 });
      expect(result).toContain('300 total');
      expect(result).toContain('200 in');
      expect(result).toContain('100 out');
      expect(result).toContain('5 calls');
    });

    it('should return "No data" for null input', () => {
      expect(mod.formatUsage(null)).toBe('No data');
    });
  });
});
