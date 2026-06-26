/**
 * rest-memory.js — Generic REST API memory provider
 *
 * Configure via config:
 *   memoryProvider: "holographic" | "hindsight" | "honcho" | "openviking" | "retaindb" | "byterover"
 *   <providerName>: { baseUrl: "...", apiKey: "...", ... }
 *
 * Expects REST endpoints:
 *   POST   /memories        — add { userId, content, metadata }
 *   POST   /memories/search — search { query, userId, limit }
 *   GET    /memories/:userId — list
 *   DELETE /memories/:id    — remove
 *   DELETE /memories/:userId/clear — clear
 */

const https = require('https');
const http = require('http');
const { MemoryProvider, registerProvider } = require('../utils/memory-provider');

const PROVIDERS = ['holographic', 'hindsight', 'honcho', 'openviking', 'retaindb', 'byterover'];

class RestMemoryProvider extends MemoryProvider {
  constructor(config = {}) {
    super(config);
    this.name = config._providerName || 'rest';
    this._providerConfig = config[this.name] || {};
  }

  _baseUrl() {
    return this._providerConfig.baseUrl || process.env[`${this.name.toUpperCase()}_URL`] || `http://localhost:3000`;
  }

  _apiKey() {
    return this._providerConfig.apiKey || process.env[`${this.name.toUpperCase()}_API_KEY`] || '';
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const key = this._apiKey();
    if (key) h['Authorization'] = 'Bearer ' + key;
    return h;
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const base = this._baseUrl().replace(/\/+$/, '');
      const url = new URL(base + path);
      const mod = url.protocol === 'https:' ? https : http;
      const opts = {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers: this._headers(),
        timeout: 15000,
      };
      const req = mod.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async add(userId, content, metadata = {}) {
    try {
      const res = await this._request('POST', '/memories', { userId: userId || 'default', content, metadata });
      return { success: true, id: res.id || content, message: `${this.name} memory added`, provider: this.name };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async search(query, options = {}) {
    try {
      const res = await this._request('POST', '/memories/search', { query, userId: options.userId, limit: options.limit || 10 });
      const results = (res.results || res || []).map(r => ({
        id: r.id,
        content: r.content || r.memory || '',
        score: r.score || 0,
        metadata: r.metadata || {},
      }));
      return { success: true, results };
    } catch (e) {
      return { success: false, error: e.message, results: [] };
    }
  }

  async list(userId) {
    try {
      const uid = userId || 'default';
      const res = await this._request('GET', `/memories/${encodeURIComponent(uid)}`);
      const memories = (res.memories || res.results || res || []).map(r => ({
        id: r.id,
        content: r.content || r.memory || '',
        score: r.score || 0,
        metadata: r.metadata || {},
      }));
      return { success: true, memories };
    } catch (e) {
      return { success: false, error: e.message, memories: [] };
    }
  }

  async remove(id) {
    try {
      await this._request('DELETE', `/memories/${encodeURIComponent(id)}`);
      return { success: true, message: `${this.name} memory removed` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async clear(userId) {
    try {
      const uid = userId || 'default';
      await this._request('DELETE', `/memories/${encodeURIComponent(uid)}/clear`);
      return { success: true, message: `${this.name} memory cleared for ${uid}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// Register all 6 provider names with the same RestMemoryProvider class
for (const name of PROVIDERS) {
  const factory = class extends RestMemoryProvider {
    constructor(config) {
      super({ ...config, _providerName: name });
    }
  };
  registerProvider(name, factory);
}

module.exports = RestMemoryProvider;
