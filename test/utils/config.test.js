import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `natureco-config-test-${Date.now()}`);

describe('config utilities', () => {
  let mod;

  beforeAll(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
  });

  beforeEach(() => {
    if (!fs.existsSync(TEST_HOME)) {
      fs.mkdirSync(TEST_HOME, { recursive: true });
    }
    mod = require('../../src/utils/config');
    if (fs.existsSync(mod.CONFIG_FILE)) {
      fs.unlinkSync(mod.CONFIG_FILE);
    }
    mod.deleteConfig();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('saveConfig / loadConfig', () => {
    it('should save and load a config', () => {
      const data = { apiKey: 'test-key', providerUrl: 'http://localhost' };
      mod.saveConfig(data, { skipBackup: true });
      const loaded = mod.loadConfig({ useCache: false });
      expect(loaded).toEqual(data);
    });

    it('should return null if no config file exists', () => {
      const loaded = mod.loadConfig({ useCache: false });
      expect(loaded).toBeNull();
    });

    it('should cache config data', () => {
      const data = { apiKey: 'cached-key' };
      mod.saveConfig(data, { skipBackup: true });

      const first = mod.loadConfig({ useCache: true });
      expect(first).toEqual(data);

      const configPath = mod.CONFIG_FILE;
      fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'modified' }), 'utf8');

      const second = mod.loadConfig({ useCache: true });
      expect(second).toEqual(data);

      const third = mod.loadConfig({ useCache: false });
      expect(third).toEqual({ apiKey: 'modified' });
    });

    it('should invalidate cache on save', () => {
      const d1 = { apiKey: 'first' };
      mod.saveConfig(d1, { skipBackup: true });
      expect(mod.loadConfig({ useCache: true })).toEqual(d1);

      const d2 = { apiKey: 'second' };
      mod.saveConfig(d2, { skipBackup: true });
      expect(mod.loadConfig({ useCache: true })).toEqual(d2);
    });
  });

  describe('validateConfig', () => {
    it('should reject null', () => {
      expect(() => mod.saveConfig(null, { skipBackup: true })).toThrow('Config cannot be null');
    });

    it('should reject arrays', () => {
      expect(() => mod.saveConfig([], { skipBackup: true })).toThrow('Config must be a JSON object');
    });

    it('should reject non-string apiKey', () => {
      expect(() => mod.saveConfig({ apiKey: 123 }, { skipBackup: true, skipValidation: false })).toThrow('apiKey must be a string');
    });

    it('should reject non-string providerUrl', () => {
      expect(() => mod.saveConfig({ providerUrl: true }, { skipBackup: true })).toThrow('providerUrl must be a string');
    });

    it('should reject non-string providerModel', () => {
      expect(() => mod.saveConfig({ providerModel: [] }, { skipBackup: true })).toThrow('providerModel must be a string');
    });

    it('validates the long-running Code round limit and allows zero for unlimited', () => {
      expect(() => mod.saveConfig({ codeMaxToolRounds: 0 }, { skipBackup: true })).not.toThrow();
      expect(() => mod.saveConfig({ codeMaxToolRounds: -1 }, { skipBackup: true })).toThrow('non-negative integer');
      expect(() => mod.saveConfig({ codeMaxToolRounds: '10000' }, { skipBackup: true })).toThrow('non-negative integer');
    });

    it('should allow skipValidation', () => {
      expect(() => mod.saveConfig(null, { skipBackup: true, skipValidation: true })).not.toThrow();
    });
  });

  describe('loadConfigWithRetry', () => {
    it('should return null on missing file', () => {
      const result = mod.loadConfigWithRetry(3);
      expect(result).toBeNull();
    });

    it('should load existing config', () => {
      mod.saveConfig({ apiKey: 'retry-key' }, { skipBackup: true });
      const result = mod.loadConfigWithRetry(3);
      expect(result).toEqual({ apiKey: 'retry-key' });
    });
  });

  describe('getApiKey / saveApiKey', () => {
    it('should get null when no config', () => {
      expect(mod.getApiKey()).toBeNull();
    });

    it('should save and retrieve api key', () => {
      mod.saveApiKey('my-api-key');
      expect(mod.getApiKey()).toBe('my-api-key');
    });
  });

  describe('getConfig / getAllConfig', () => {
    it('should return empty object when no config', () => {
      expect(mod.getConfig()).toEqual({});
    });

    it('should return saved config', () => {
      mod.saveConfig({ apiKey: 'k' }, { skipBackup: true });
      expect(mod.getConfig()).toEqual({ apiKey: 'k' });
    });
  });

  describe('setConfigValue', () => {
    it('should set a top-level key', () => {
      mod.setConfigValue('apiKey', 'new-key');
      expect(mod.getApiKey()).toBe('new-key');
    });

    it('should set a nested key', () => {
      mod.setConfigValue('provider.openai.model', 'gpt-4');
      const config = mod.loadConfig({ useCache: false });
      expect(config.provider.openai.model).toBe('gpt-4');
    });
  });

  describe('getConfigHash', () => {
    it('should return null before config loaded', () => {
      expect(mod.getConfigHash()).toBeNull();
    });

    it('should return a hash after config saved', () => {
      mod.saveConfig({ apiKey: 'hash-test' }, { skipBackup: true });
      const hash = mod.getConfigHash();
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });
  });

  describe('backups and restore', () => {
    it('should list empty backups when directory missing', () => {
      expect(mod.listBackups()).toEqual([]);
    });

    it('should create backups on save', () => {
      mod.saveConfig({ apiKey: 'v1' }, { skipBackup: false });
      mod.saveConfig({ apiKey: 'v2' }, { skipBackup: false });
      const backups = mod.listBackups();
      expect(backups.length).toBeGreaterThanOrEqual(1);
    });

    it('should restore a backup file', () => {
      mod.saveConfig({ apiKey: 'original' }, { skipBackup: false });
      mod.saveConfig({ apiKey: 'overwritten' }, { skipBackup: false });
      const backups = mod.listBackups();
      expect(backups.length).toBeGreaterThan(0);

      const result = mod.restoreConfig(backups[backups.length - 1]);
      expect(result.path).toBeTruthy();
      expect(result.timestamp).toBeTruthy();

      const config = mod.loadConfig({ useCache: false });
      expect(config.apiKey).toBe('original');
    });

    it('should throw on missing backup file', () => {
      expect(() => mod.restoreConfig('nonexistent.json')).toThrow('Yedek dosyası bulunamadı');
    });
  });

  describe('deleteConfig', () => {
    it('should delete config file and clear cache', () => {
      mod.saveConfig({ apiKey: 'delete-me' }, { skipBackup: true });
      expect(fs.existsSync(mod.CONFIG_FILE)).toBe(true);
      mod.deleteConfig();
      expect(fs.existsSync(mod.CONFIG_FILE)).toBe(false);
      expect(mod.loadConfig({ useCache: true })).toBeNull();
    });
  });
});
