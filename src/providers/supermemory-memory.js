/**
 * supermemory-memory.js — Supermemory memory provider
 *
 * Uses the supermemory npm package.
 * Requires SUPERMEMORY_API_KEY env var or config.supermemory.apiKey.
 * npm install supermemory
 */

const { MemoryProvider, registerProvider } = require('../utils/memory-provider');

class SupermemoryMemoryProvider extends MemoryProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'supermemory';
    this._client = null;
  }

  _getConfig() {
    return this.config.supermemory || this.config.Supermemory || {};
  }

  _apiKey() {
    return process.env.SUPERMEMORY_API_KEY || this._getConfig().apiKey || '';
  }

  async _ensureClient() {
    if (this._client) return;
    try {
      const Supermemory = (await import('supermemory')).default;
      this._client = new Supermemory({
        apiKey: this._apiKey() || undefined,
        ...this._getConfig().options,
      });
    } catch (e) {
      throw new Error('supermemory paketi yuklu degil. npm install supermemory');
    }
  }

  async add(userId, content, metadata = {}) {
    await this._ensureClient();
    const tag = `user_${(userId || 'default').toLowerCase()}`;
    await this._client.add({
      content,
      containerTags: [tag],
      ...metadata,
    });
    return { success: true, id: content, message: 'Supermemory added', provider: 'supermemory' };
  }

  async search(query, options = {}) {
    await this._ensureClient();
    const tag = options.userId ? `user_${options.userId.toLowerCase()}` : undefined;
    try {
      const response = await this._client.search.documents({
        q: query,
        ...(tag ? { containerTags: [tag] } : {}),
        limit: options.limit || 10,
      });
      return {
        success: true,
        results: (response.results || []).map(r => ({
          id: r.id,
          content: r.content || '',
          score: r.score || 0,
          metadata: r.metadata || {},
        })),
      };
    } catch (e) {
      return { success: false, error: e.message, results: [] };
    }
  }

  async list(userId) {
    await this._ensureClient();
    const tag = `user_${(userId || 'default').toLowerCase()}`;
    try {
      const docs = await this._client.documents.list({ containerTags: [tag] });
      return {
        success: true,
        memories: (docs.results || docs || []).map(r => ({
          id: r.id,
          content: r.content || '',
          score: 0,
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
      await this._client.documents.delete({ docId: id });
      return { success: true, message: 'Supermemory removed' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async clear(userId) {
    const tag = `user_${(userId || 'default').toLowerCase()}`;
    try {
      const listed = await this.list(userId);
      for (const mem of listed.memories || []) {
        try { await this.remove(mem.id); } catch {}
      }
      return { success: true, message: `Supermemory cleared for ${tag}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

registerProvider('supermemory', SupermemoryMemoryProvider);
module.exports = SupermemoryMemoryProvider;
