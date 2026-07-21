/**
 * memory_provider — Switchable memory backend tool
 *
 * Uses the memory provider abstraction. Default: file (same as memory_write).
 * Switch provider via config: memoryProvider: "mem0" | "supermemory" | ...
 * Or env: NATURECO_MEMORY_PROVIDER=mem0
 *
 * Actions:
 *   add    — save a memory
 *   search — semantic/keyword search
 *   list   — list all memories for a user
 *   remove — delete a memory
 *   clear  — clear all memories for a user
 *   status — show active provider info
 */

const { getActiveProvider, getProviderNames } = require('../utils/memory-provider');
require('../providers/file-memory');
require('../providers/mem0-memory');
require('../providers/supermemory-memory');
require('../providers/rest-memory');
const loadConfig = () => {
  try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
};

const name = 'memory_provider';
const description = 'Unified memory backend with pluggable providers. add/search/list/remove/clear/status. Default is file-based. Switch via NATURECO_MEMORY_PROVIDER env or config.memoryProvider.';
const inputSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'search', 'list', 'remove', 'clear', 'status'],
      description: 'Operation: add, search, list, remove, clear, or status',
    },
    content: { type: 'string', description: 'Memory content to add, or query for search' },
    userId: { type: 'string', description: 'User identifier' },
    metadata: { type: 'object', description: 'Additional metadata (category, score, etc.)' },
    limit: { type: 'number', description: 'Max results for search/list' },
    provider: { type: 'string', description: 'Override provider name (default: config or file)' },
  },
  required: ['action'],
};

async function execute(params) {
  const cfg = loadConfig();
  const providerName = params.provider || process.env.NATURECO_MEMORY_PROVIDER || cfg.memoryProvider;
  let Provider;
  if (providerName) {
    const { getProvider } = require('../utils/memory-provider');
    Provider = getProvider(providerName);
    if (typeof Provider !== 'function') {
      return { success: false, error: `Memory provider not available: ${providerName}` };
    }
  }
  if (!Provider) {
    // Load default (file)
    Provider = getActiveProvider(cfg);
  }
  if (typeof Provider !== 'function') {
    return { success: false, error: 'No memory provider is available' };
  }
  const provider = new Provider(cfg);
  const userId = params.userId || cfg.userName || 'default';

  switch (params.action) {
    case 'add':
      if (!params.content) return JSON.stringify({ success: false, error: 'content required for add' });
      return provider.add(userId, params.content, params.metadata || {});

    case 'search':
      if (!params.content) return JSON.stringify({ success: false, error: 'content (query) required for search' });
      return provider.search(params.content, { userId, limit: params.limit || 10 });

    case 'list':
      return provider.list(userId);

    case 'remove':
      if (!params.content) return JSON.stringify({ success: false, error: 'content (id) required for remove' });
      return provider.remove(params.content);

    case 'clear':
      return provider.clear(userId);

    case 'status': {
      const avail = getProviderNames().sort();
      return {
        active: provider.name,
        available: avail,
        userId,
        config: cfg.memoryProvider || '(not set, using default)',
        env: process.env.NATURECO_MEMORY_PROVIDER || '(not set)',
      };
    }

    default:
      return JSON.stringify({ success: false, error: `Unknown action: ${params.action}` });
  }
}

module.exports = { name, description, inputSchema, execute };
