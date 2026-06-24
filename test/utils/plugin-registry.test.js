import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `natureco-plugin-test-${Date.now()}`);

describe('plugin-registry', () => {
  let mod;

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    vi.resetModules();
    if (!fs.existsSync(TEST_HOME)) {
      fs.mkdirSync(TEST_HOME, { recursive: true });
    }
    mod = require('../../src/utils/plugin-registry');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('loadRegistry / saveRegistry', () => {
    it('should return default registry when no file exists', () => {
      const registry = mod.loadRegistry();
      expect(registry.version).toBe(1);
      expect(registry.plugins).toEqual([]);
      expect(registry.updatedAt).toBeNull();
    });

    it('should save and load registry', () => {
      const data = { version: 1, plugins: [{ id: 'test-plugin', name: 'Test' }], updatedAt: null };
      mod.saveRegistry(data);
      const loaded = mod.loadRegistry();
      expect(loaded.plugins.length).toBe(1);
      expect(loaded.plugins[0].id).toBe('test-plugin');
      expect(loaded.updatedAt).toBeTruthy();
    });

    it('should handle corrupted registry file', () => {
      const dir = path.join(TEST_HOME, '.natureco');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'plugin-registry.json'), '{corrupted}', 'utf-8');
      const registry = mod.loadRegistry();
      expect(registry.version).toBe(1);
      expect(registry.plugins).toEqual([]);
    });
  });

  describe('validateManifest', () => {
    it('should require a name', () => {
      const errors = mod.validateManifest({});
      expect(errors).toContain('Plugin adı (name) gerekli');
    });

    it('should require an entry point', () => {
      const errors = mod.validateManifest({ name: 'test' });
      expect(errors).toContain('Entry noktası (entry/index.js) gerekli');
    });

    it('should accept valid openclaw tool config as entry', () => {
      const errors = mod.validateManifest({ name: 'test', openclaw: { tool: 'my-tool' } });
      expect(errors).not.toContain('Entry noktası (entry/index.js) gerekli');
    });

    it('should validate semver version', () => {
      const errors1 = mod.validateManifest({ name: 'test', entry: 'index.js', version: 'invalid' });
      expect(errors1).toContain('Version semver formatında olmalı (x.y.z)');

      const errors2 = mod.validateManifest({ name: 'test', entry: 'index.js', version: '1.2.3' });
      expect(errors2).not.toContain('Version semver formatında olmalı');
    });

    it('should accept valid manifest', () => {
      const errors = mod.validateManifest({ name: 'test', entry: 'index.js', version: '1.0.0' });
      expect(errors.length).toBe(0);
    });
  });

  describe('scanInstalled / getPlugin / getInstalledIds', () => {
    it('should return empty arrays when no plugins', () => {
      expect(mod.scanInstalled()).toEqual([]);
      expect(mod.getInstalledIds()).toEqual([]);
    });

    it('should detect installed plugins from filesystem', () => {
      const pluginDir = path.join(mod.PLUGINS_DIR, 'my-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'My Plugin',
        entry: 'index.js',
        version: '2.0.0',
      }), 'utf-8');
      fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = {}', 'utf-8');

      const installed = mod.scanInstalled();
      expect(installed.length).toBe(1);
      expect(installed[0].slug).toBe('my-plugin');
      expect(installed[0].name).toBe('My Plugin');
      expect(installed[0].version).toBe('2.0.0');
      expect(installed[0].enabled).toBe(true);

      const plugin = mod.getPlugin('my-plugin');
      expect(plugin).not.toBeNull();
      expect(plugin.slug).toBe('my-plugin');

      expect(mod.getPlugin('nonexistent')).toBeNull();
    });

    it('should detect disabled plugin via .disabled sentinel', () => {
      const pluginDir = path.join(mod.PLUGINS_DIR, 'disabled-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'Disabled',
        entry: 'index.js',
      }), 'utf-8');
      fs.writeFileSync(path.join(pluginDir, '.disabled'), '', 'utf-8');

      const installed = mod.scanInstalled();
      const dp = installed.find(p => p.slug === 'disabled-plugin');
      expect(dp).toBeTruthy();
      expect(dp.enabled).toBe(false);
    });

    it('should merge filesystem and registry IDs', () => {
      const pluginDir = path.join(mod.PLUGINS_DIR, 'disk-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'Disk Plugin',
        entry: 'index.js',
      }), 'utf-8');

      mod.saveRegistry({ version: 1, plugins: [{ id: 'registry-only-plugin', name: 'Registry Only' }], updatedAt: null });

      const ids = mod.getInstalledIds();
      expect(ids).toContain('disk-plugin');
      expect(ids).toContain('registry-only-plugin');
    });
  });

  describe('readManifest', () => {
    it('should read from plugin.json over package.json', () => {
      const pluginDir = path.join(mod.PLUGINS_DIR, 'manifest-test');
      fs.mkdirSync(pluginDir, { recursive: true });

      fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: 'from-package',
        version: '1.0.0',
        description: 'from package.json',
      }), 'utf-8');

      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'from-plugin',
        description: 'from plugin.json',
      }), 'utf-8');

      const result = mod.scanInstalled();
      const p = result.find(r => r.slug === 'manifest-test');
      expect(p).toBeTruthy();
      expect(p.name).toBe('from-plugin');
      expect(p.description).toBe('from plugin.json');
      expect(p.version).toBe('1.0.0');
    });

    it('should fall back to directory name', () => {
      const pluginDir = path.join(mod.PLUGINS_DIR, 'fallback-test');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = {}', 'utf-8');

      const result = mod.scanInstalled();
      const p = result.find(r => r.slug === 'fallback-test');
      expect(p).toBeTruthy();
      expect(p.name).toBe('fallback-test');
      expect(p.version).toBe('1.0.0');
    });
  });

  describe('searchRegistry', () => {
    it('should find plugins by id or name', () => {
      mod.saveRegistry({
        version: 1,
        plugins: [
          { id: 'my-plugin', name: 'My Plugin' },
          { id: 'other-tool', name: 'Other Tool' },
        ],
        updatedAt: null,
      });

      const results = mod.searchRegistry('plugin');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('my-plugin');
    });
  });

  describe('PLUGINS_DIR', () => {
    it('should point to .natureco/plugins', () => {
      expect(mod.PLUGINS_DIR).toContain('.natureco');
      expect(mod.PLUGINS_DIR).toContain('plugins');
    });
  });
});
