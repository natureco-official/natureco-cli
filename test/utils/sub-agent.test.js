import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `natureco-subagent-test-${Date.now()}`);

describe('sub-agent utilities', () => {
  let mod;
  let apiMock;

  beforeAll(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
  });

  beforeEach(() => {
    if (!fs.existsSync(TEST_HOME)) {
      fs.mkdirSync(TEST_HOME, { recursive: true });
    }
    vi.resetModules();
    apiMock = require('../../src/utils/api');
    vi.spyOn(apiMock, 'getProviderConfig').mockReturnValue({
      url: 'http://localhost:11434',
      apiKey: 'test-key',
      model: 'test-model',
    });
    mod = require('../../src/utils/sub-agent');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'mock response' } }],
        usage: { prompt_tokens: 5, completion_tokens: 15 },
      }),
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('spawnSubAgent', () => {
    it('should throw error for invalid type', async () => {
      await expect(mod.spawnSubAgent('invalid', 'test task')).rejects.toThrow('Invalid sub-agent type');
    });

    it('should create entry in sub-agents.json', async () => {
      const result = await mod.spawnSubAgent('explore', 'find files');
      expect(result.result).toBe('mock response');
      expect(result.duration).toBeGreaterThanOrEqual(0);

      const agentsFile = path.join(TEST_HOME, '.natureco', 'sub-agents.json');
      const agents = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
      expect(agents.length).toBe(1);
      expect(agents[0].type).toBe('explore');
      expect(agents[0].status).toBe('completed');
    });
  });

  describe('spawnParallel', () => {
    it('should handle empty agents array', async () => {
      const result = await mod.spawnParallel([]);
      expect(result.results).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should execute all agents in parallel', async () => {
      const agents = [
        { type: 'explore', task: 'task1' },
        { type: 'general', task: 'task2' },
      ];

      const result = await mod.spawnParallel(agents);
      expect(result.results.length).toBe(2);
      expect(result.failed).toEqual([]);

      const agentsFile = path.join(TEST_HOME, '.natureco', 'sub-agents.json');
      const saved = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
      expect(saved.length).toBe(2);
    });
  });

  describe('getStatus', () => {
    it('should return summary object with total, running, completed, failed', async () => {
      const agentsDir = path.join(TEST_HOME, '.natureco');
      const agentsFile = path.join(agentsDir, 'sub-agents.json');
      if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

      const existingAgents = [
        { id: '1', type: 'explore', status: 'completed', task: 'a' },
        { id: '2', type: 'review', status: 'running', task: 'b' },
        { id: '3', type: 'general', status: 'failed', task: 'c' },
      ];
      fs.writeFileSync(agentsFile, JSON.stringify(existingAgents, null, 2));

      const status = mod.getStatus();
      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('completed');
      expect(status).toHaveProperty('failed');
      expect(status.total).toBe(3);
      expect(status.running).toBe(1);
      expect(status.completed).toBe(1);
      expect(status.failed).toBe(1);
    });

    it('should return zeros when no agents exist', () => {
      const status = mod.getStatus();
      expect(status.total).toBe(0);
      expect(status.running).toBe(0);
      expect(status.completed).toBe(0);
      expect(status.failed).toBe(0);
      expect(status.agents).toEqual([]);
    });
  });
});
