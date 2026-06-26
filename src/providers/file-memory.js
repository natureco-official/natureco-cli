/**
 * file-memory.js — File-based memory provider (default)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MemoryProvider, registerProvider } = require('../utils/memory-provider');

const BASE_DIR = path.join(os.homedir(), '.natureco', 'memory');

class FileMemoryProvider extends MemoryProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'file';
  }

  _ensureDir() {
    if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  }

  _fileFor(userId) {
    return path.join(BASE_DIR, `${(userId || 'default').toLowerCase()}.json`);
  }

  _load(userId) {
    this._ensureDir();
    const file = this._fileFor(userId);
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    return { name: userId || 'User', nickname: null, botName: null, facts: [], preferences: [] };
  }

  _save(userId, data) {
    this._ensureDir();
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this._fileFor(userId), JSON.stringify(data, null, 2));
  }

  async add(userId, content, metadata = {}) {
    const uid = userId || 'default';
    const mem = this._load(uid);
    const now = new Date().toISOString();
    const existing = mem.facts.find(f => (f.value || '').toLowerCase() === content.toLowerCase());
    if (existing) {
      existing.score = Math.min(10, (existing.score || 5) + 2);
      existing.updatedAt = now;
    } else {
      mem.facts.push({
        value: content,
        score: metadata.score || 5,
        category: metadata.category || 'general',
        createdAt: now,
        updatedAt: now,
      });
    }
    if (metadata.name) mem.name = metadata.name;
    if (metadata.botName) mem.botName = metadata.botName;
    if (metadata.nickname !== undefined) mem.nickname = metadata.nickname;
    this._save(uid, mem);
    return { success: true, id: content, message: 'Memory added', totalFacts: mem.facts.length };
  }

  async search(query, options = {}) {
    const uid = options.userId;
    const results = [];
    if (uid) {
      const mem = this._load(uid);
      for (const f of mem.facts || []) {
        const v = f.value || '';
        if (v.toLowerCase().includes(query.toLowerCase())) {
          results.push({ id: v, content: v, score: f.score || 5, metadata: { category: f.category } });
        }
      }
    } else {
      this._ensureDir();
      const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const mem = JSON.parse(fs.readFileSync(path.join(BASE_DIR, file), 'utf8'));
          for (const f of mem.facts || []) {
            const v = f.value || '';
            if (v.toLowerCase().includes(query.toLowerCase())) {
              results.push({ id: v, content: v, score: f.score || 5, metadata: { userId: file.replace('.json', ''), category: f.category } });
            }
          }
        } catch {}
      }
    }
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    const limit = options.limit || 20;
    return { success: true, results: results.slice(0, limit) };
  }

  async list(userId) {
    const uid = userId || 'default';
    const mem = this._load(uid);
    return {
      success: true,
      memories: (mem.facts || []).map(f => ({
        id: f.value,
        content: f.value,
        score: f.score,
        metadata: { category: f.category, createdAt: f.createdAt, updatedAt: f.updatedAt },
      })),
      name: mem.name,
      nickname: mem.nickname,
      botName: mem.botName,
    };
  }

  async remove(id) {
    const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const mem = JSON.parse(fs.readFileSync(path.join(BASE_DIR, file), 'utf8'));
        const before = mem.facts.length;
        mem.facts = mem.facts.filter(f => (f.value || '').toLowerCase() !== id.toLowerCase());
        if (mem.facts.length !== before) {
          this._save(file.replace('.json', ''), mem);
          return { success: true, message: 'Memory removed' };
        }
      } catch {}
    }
    return { success: false, message: 'Memory not found' };
  }

  async clear(userId) {
    const uid = userId || 'default';
    const file = this._fileFor(uid);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { success: true, message: `Memory cleared for ${uid}` };
  }
}

registerProvider('file', FileMemoryProvider);
module.exports = FileMemoryProvider;
