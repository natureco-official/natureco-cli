/**
 * memory-provider.js — Abstract memory backend interface + registry
 *
 * All memory providers extend the MemoryProvider base class.
 * Register a provider via registerProvider(name, class) and
 * switch with memory config or environment variable.
 */

const path = require('path');
const os = require('os');

const PROVIDER_CONFIG_KEY = 'memoryProvider';
const DEFAULT_PROVIDER = 'file';

// Registry: name -> class
const _registry = new Map();

function registerProvider(name, providerClass) {
  _registry.set(name, providerClass);
}

function getProviderNames() {
  return Array.from(_registry.keys());
}

function getProvider(name) {
  const Cls = _registry.get(name);
  if (!Cls) return null;
  return Cls;
}

/**
 * Resolve active provider from config + env + defaults.
 * Priority: env NATURECO_MEMORY_PROVIDER > config.memoryProvider > 'file'
 */
function resolveProviderConfig(cfg) {
  const env = process.env.NATURECO_MEMORY_PROVIDER || '';
  if (env && _registry.has(env)) return env;
  if (cfg && cfg[PROVIDER_CONFIG_KEY] && _registry.has(cfg[PROVIDER_CONFIG_KEY])) {
    return cfg[PROVIDER_CONFIG_KEY];
  }
  return DEFAULT_PROVIDER;
}

/**
 * Get an instance of the active memory provider.
 * Provider classes should be singletons — call this once, cache the result.
 */
function getActiveProvider(cfg) {
  const name = resolveProviderConfig(cfg);
  const Cls = getProvider(name);
  if (!Cls) return getProvider(DEFAULT_PROVIDER);
  return Cls;
}

/**
 * MemoryProvider base class.
 *
 * Subclasses must implement:
 *   add(userId, content, metadata)   → { success, id, message }
 *   search(query, options)            → { success, results: [{id, content, score, metadata}] }
 *   list(userId)                      → { success, memories: [{id, content, metadata}] }
 *   remove(id)                        → { success, message }
 *   clear(userId)                     → { success, message }
 */
class MemoryProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  async add(userId, content, metadata = {}) {
    throw new Error('Not implemented: add');
  }

  async search(query, options = {}) {
    throw new Error('Not implemented: search');
  }

  async list(userId) {
    throw new Error('Not implemented: list');
  }

  async remove(id) {
    throw new Error('Not implemented: remove');
  }

  async clear(userId) {
    throw new Error('Not implemented: clear');
  }

  /**
   * Extract a user ID from args or config
   */
  _userId(args) {
    return args?.userId || args?.username || args?.user || this.config?.defaultUserId || 'default';
  }
}

module.exports = {
  MemoryProvider,
  registerProvider,
  getProviderNames,
  getProvider,
  resolveProviderConfig,
  getActiveProvider,
  PROVIDER_CONFIG_KEY,
  DEFAULT_PROVIDER,
};
