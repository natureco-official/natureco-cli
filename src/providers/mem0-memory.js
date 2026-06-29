/**
 * mem0-memory.js — Mem0 memory provider
 *
 * Uses the mem0ai npm package (platform API) or local OSS Memory class.
 * Requires MEM0_API_KEY env var or config.mem0.apiKey.
 * npm install mem0ai
 */

const { MemoryProvider, registerProvider } = require('../utils/memory-provider');

class Mem0MemoryProvider extends MemoryProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'mem0';
    this._client = null;
    this._mode = 'platform'; // or 'oss'
  }

  _getConfig() {
    return this.config.mem0 || this.config.Mem0 || {};
  }

  _apiKey() {
    return process.env.MEM0_API_KEY || this._getConfig().apiKey || '';
  }

  async _ensureClient() {
    if (this._client) return;
    try {
      const apiKey = this._apiKey();
      if (apiKey) {
        const { MemoryClient } = await import('mem0ai');
        this._client = new MemoryClient({ apiKey });
        this._mode = 'platform';
      } else {
        const { Memory } = await import('mem0ai/oss');
        this._client = new Memory(this._getConfig().oss || {});
        this._mode = 'oss';
      }
    } catch (e) {
      throw new Error('mem0ai paketi yuklu degil. npm install mem0ai', { cause: e });
    }
  }

  async add(userId, content, metadata = {}) {
    await this._ensureClient();
    const uid = userId || 'default';
    if (this._mode === 'platform') {
      const messages = [{ role: 'user', content }];
      await this._client.add(messages, { userId: uid, metadata });
    } else {
      const messages = [
        { role: 'user', content },
        { role: 'assistant', content: 'Bilgi kaydedildi.' },
      ];
      await this._client.add(messages, { userId: uid, metadata });
    }
    return { success: true, id: content, message: 'Mem0 memory added', provider: 'mem0' };
  }

  async search(query, options = {}) {
    await this._ensureClient();
    const uid = options.userId;
    const filters = uid ? { userId: uid } : {};
    if (options.limit) filters.limit = options.limit;
    try {
      const results = await this._client.search(query, { filters });
      return { success: true, results: (results.results || results || []).map(r => ({
        id: r.id || r.memory,
        content: r.memory || r.content || '',
        score: r.score || 0,
        metadata: r.metadata || {},
      })) };
    } catch (e) {
      return { success: false, error: e.message, results: [] };
    }
  }

  async list(userId) {
    await this._ensureClient();
    const uid = userId || 'default';
    try {
      const memories = await this._client.getAll({ userId: uid });
      return {
        success: true,
        memories: (memories || []).map(r => ({
          id: r.id || r.memory,
          content: r.memory || r.content || '',
          score: r.score || 0,
          metadata: r.metadata || {},
        })),
      };
    } catch (e) {
      return { success: false, error: e.message, memories: [] };
    }
  }

  async remove(id) {
    await this._ensureClient();
    try {
      await this._client.delete(id);
      return { success: true, message: 'Mem0 memory removed' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async clear(userId) {
    await this._ensureClient();
    const uid = userId || 'default';
    try {
      await this._client.deleteAll({ userId: uid });
      return { success: true, message: `Mem0 memory cleared for ${uid}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

registerProvider('mem0', Mem0MemoryProvider);
module.exports = Mem0MemoryProvider;
