import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('secrets', () => {
  let mod;

  beforeEach(() => {
    vi.resetModules();
    // Clear any cached modules
    mod = require('../../src/utils/secrets');
    mod.clearSecretCache();
  });

  afterEach(() => {
    mod.clearSecretCache();
  });

  describe('coerceSecretRef', () => {
    it('should return null for non-string values', () => {
      expect(mod.coerceSecretRef(null)).toBeNull();
      expect(mod.coerceSecretRef(123)).toBeNull();
      expect(mod.coerceSecretRef(undefined)).toBeNull();
    });

    it('should parse ${VAR} shorthand', () => {
      const ref = mod.coerceSecretRef('${MY_KEY}');
      expect(ref).toEqual({ source: 'env', provider: 'default', id: 'MY_KEY' });
    });

    it('should parse $VAR shorthand', () => {
      const ref = mod.coerceSecretRef('$MY_KEY');
      expect(ref).toEqual({ source: 'env', provider: 'default', id: 'MY_KEY' });
    });

    it('should parse secretref-env: prefix', () => {
      const ref = mod.coerceSecretRef('secretref-env:MY_KEY');
      expect(ref).toEqual({ source: 'env', provider: 'default', id: 'MY_KEY' });
    });

    it('should parse __env__: legacy prefix', () => {
      const ref = mod.coerceSecretRef('__env__:MY_KEY');
      expect(ref).toEqual({ source: 'env', provider: 'default', id: 'MY_KEY' });
    });

    it('should parse structured JSON ref', () => {
      const ref = mod.coerceSecretRef(JSON.stringify({ source: 'env', provider: 'aws', id: 'DB_PASS' }));
      expect(ref).toEqual({ source: 'env', provider: 'aws', id: 'DB_PASS' });
    });

    it('should return null for plain strings', () => {
      expect(mod.coerceSecretRef('plain-value')).toBeNull();
    });

    it('should parse short env var names', () => {
      const ref = mod.coerceSecretRef('${A}');
      expect(ref).toEqual({ source: 'env', provider: 'default', id: 'A' });
    });
  });

  describe('resolveSecretRef', () => {
    it('should resolve env var', () => {
      process.env.TEST_SECRET = 'resolved-value';
      const ref = { source: 'env', provider: 'default', id: 'TEST_SECRET' };
      expect(mod.resolveSecretRef(ref, { cache: false })).toBe('resolved-value');
      delete process.env.TEST_SECRET;
    });

    it('should return null for unresolvable env var', () => {
      const ref = { source: 'env', provider: 'default', id: 'NONEXISTENT_VAR_12345' };
      expect(mod.resolveSecretRef(ref, { cache: false })).toBeNull();
    });

    it('should throw on missing when throwOnMissing=true', () => {
      const ref = { source: 'env', provider: 'default', id: 'MISSING_VAR_12345' };
      expect(() => mod.resolveSecretRef(ref, { cache: false, throwOnMissing: true })).toThrow('Secret not found');
    });

    it('should cache resolved values', () => {
      process.env.CACHED_SECRET = 'cached';
      const ref = { source: 'env', provider: 'default', id: 'CACHED_SECRET' };

      const first = mod.resolveSecretRef(ref, { cache: true });
      expect(first).toBe('cached');

      delete process.env.CACHED_SECRET;

      // Should still return cached value
      const second = mod.resolveSecretRef(ref, { cache: true });
      expect(second).toBe('cached');

      // Bypass cache
      const third = mod.resolveSecretRef(ref, { cache: false });
      expect(third).toBeNull();
    });
  });

  describe('resolveSecretValue', () => {
    it('should return value unchanged if not a ref', () => {
      expect(mod.resolveSecretValue('plain-string')).toBe('plain-string');
      expect(mod.resolveSecretValue(42)).toBe(42);
      expect(mod.resolveSecretValue(null)).toBeNull();
    });

    it('should resolve env refs', () => {
      process.env.MY_VAL = 'from-env';
      expect(mod.resolveSecretValue('${MY_VAL}', { cache: false })).toBe('from-env');
      delete process.env.MY_VAL;
    });

    it('should return original value if ref cannot be resolved', () => {
      expect(mod.resolveSecretValue('${MISSING_VAR_12345}', { cache: false })).toBe('${MISSING_VAR_12345}');
    });
  });

  describe('resolveConfigSecrets', () => {
    it('should recursively resolve secrets in config', () => {
      process.env.DB_HOST = 'localhost';
      process.env.DB_PORT = '5432';

      const config = {
        database: {
          host: '${DB_HOST}',
          port: '${DB_PORT}',
          name: 'mydb',
        },
        apiKey: 'plain-key',
      };

      const resolved = mod.resolveConfigSecrets(config, { cache: false });
      expect(resolved.database.host).toBe('localhost');
      expect(resolved.database.port).toBe('5432');
      expect(resolved.database.name).toBe('mydb');
      expect(resolved.apiKey).toBe('plain-key');

      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
    });

    it('should handle non-object config', () => {
      expect(mod.resolveConfigSecrets(null)).toBeNull();
      expect(mod.resolveConfigSecrets('string')).toBe('string');
    });
  });

  describe('loadEnvFile', () => {
    it('should return {} for non-existent file', () => {
      const result = mod.loadEnvFile('/nonexistent/.env');
      expect(result).toEqual({});
    });

    it('should parse env file contents', () => {
      const tmpEnv = path.join(os.tmpdir(), `.env-test-${Date.now()}`);
      fs.writeFileSync(tmpEnv, [
        'DB_HOST=localhost',
        'DB_PORT=5432',
        '# comment',
        '',
        'APP_ENV=production',
      ].join('\n'), 'utf8');

      const env = mod.loadEnvFile(tmpEnv);
      expect(env.DB_HOST).toBe('localhost');
      expect(env.DB_PORT).toBe('5432');
      expect(env.APP_ENV).toBe('production');
      expect(env['# comment']).toBeUndefined();

      fs.unlinkSync(tmpEnv);
    });

    it('should strip quotes from values', () => {
      const tmpEnv = path.join(os.tmpdir(), `.env-quote-test-${Date.now()}`);
      fs.writeFileSync(tmpEnv, [
        'KEY1="quoted value"',
        "KEY2='single quoted'",
      ].join('\n'), 'utf8');

      const env = mod.loadEnvFile(tmpEnv);
      expect(env.KEY1).toBe('quoted value');
      expect(env.KEY2).toBe('single quoted');

      fs.unlinkSync(tmpEnv);
    });

    it('should skip lines without =', () => {
      const tmpEnv = path.join(os.tmpdir(), `.env-skip-test-${Date.now()}`);
      fs.writeFileSync(tmpEnv, [
        'JUST_A_COMMENT',
        'KEY=value',
      ].join('\n'), 'utf8');

      const env = mod.loadEnvFile(tmpEnv);
      expect(env.KEY).toBe('value');
      expect(env.JUST_A_COMMENT).toBeUndefined();

      fs.unlinkSync(tmpEnv);
    });
  });

  describe('injectEnvFile', () => {
    it('should inject env vars into process.env', () => {
      const tmpEnv = path.join(os.tmpdir(), `.env-inject-test-${Date.now()}`);
      fs.writeFileSync(tmpEnv, 'INJECTED_KEY=injected-value', 'utf8');

      mod.injectEnvFile(tmpEnv);
      expect(process.env.INJECTED_KEY).toBe('injected-value');

      delete process.env.INJECTED_KEY;
      fs.unlinkSync(tmpEnv);
    });

    it('should not overwrite existing process.env vars', () => {
      process.env.EXISTING_KEY = 'original';
      const tmpEnv = path.join(os.tmpdir(), `.env-no-overwrite-${Date.now()}`);
      fs.writeFileSync(tmpEnv, 'EXISTING_KEY=overwritten', 'utf8');

      mod.injectEnvFile(tmpEnv);
      expect(process.env.EXISTING_KEY).toBe('original');

      delete process.env.EXISTING_KEY;
      fs.unlinkSync(tmpEnv);
    });
  });

  describe('clearSecretCache', () => {
    it('should clear the cache', () => {
      process.env.CACHE_TEST = 'cached';
      const ref = { source: 'env', provider: 'default', id: 'CACHE_TEST' };
      mod.resolveSecretRef(ref, { cache: true });
      delete process.env.CACHE_TEST;

      mod.clearSecretCache();
      const result = mod.resolveSecretRef(ref, { cache: true });
      expect(result).toBeNull();
    });
  });

  describe('listSecretRefs', () => {
    it('should list all secret refs in config', () => {
      const config = {
        api: {
          key: '${API_KEY}',
          url: 'https://example.com',
        },
        db: {
          password: '$DB_PASS',
        },
      };

      const refs = mod.listSecretRefs(config);
      expect(refs.length).toBe(2);
      expect(refs[0].path).toBe('api.key');
      expect(refs[0].ref.id).toBe('API_KEY');
      expect(refs[1].path).toBe('db.password');
      expect(refs[1].ref.id).toBe('DB_PASS');
    });

    it('should return empty array for non-object', () => {
      expect(mod.listSecretRefs(null)).toEqual([]);
      expect(mod.listSecretRefs('string')).toEqual([]);
    });
  });
});
