/**
 * memory — Unified memory tool (Hermes-style, merged with memory_write + memory_search)
 *
 * Single tool with action=add|remove|replace|list|search, target=memory|user
 *
 * Uses memory-store (MEMORY.md / USER.md) for add/remove/replace/list.
 * Search action uses the legacy memory_write/search JSON files for cross-session query.
 */

const { getMemoryStore } = require('../utils/memory-store');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { foldTr } = require('../utils/tr-text');

const name = 'memory';
const description = 'Persistent memory across sessions. action=add to save facts, action=list to see everything, action=remove to delete by substring, action=search to query all past sessions and memory files. target=memory for environment facts, target=user for user preferences.';
const inputSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'remove', 'replace', 'list', 'search'],
      description: 'Operation: add (append entry), remove (by substring match), replace (find by substring, replace), list (show all), search (query all memory + sessions)',
    },
    target: {
      type: 'string',
      enum: ['memory', 'user'],
      description: 'Which store: memory (agent notes) or user (user preferences/habits)',
    },
    content: {
      type: 'string',
      description: 'Content to add/remove/replace. For replace, this is the new content. For search, the query string.',
    },
    oldContent: {
      type: 'string',
      description: 'For replace: substring to match existing entry.',
    },
    scope: {
      type: 'string',
      enum: ['all', 'memory', 'sessions'],
      description: 'For search: scope to search (all=memory files + sessions, memory=only memory files, sessions=only session history)',
    },
    maxResults: {
      type: 'number',
      description: 'For search: max results (default 10)',
    },
  },
  required: ['action'],
};

// ── Legacy search helpers (from memory_search.js) ────────────────────────

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');
const SESSION_DIR = path.join(os.homedir(), '.natureco', 'sessions');

function _searchInObject(obj, query, pathStr) {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  if (typeof obj === 'string' && foldTr(obj).includes(query)) {
    return [{ path: pathStr, content: obj.slice(0, 200) }];
  }
  for (const [key, val] of Object.entries(obj)) {
    const newPath = pathStr ? pathStr + '.' + key : key;
    if (typeof val === 'string' && foldTr(val).includes(query)) {
      results.push({ path: newPath, content: val.slice(0, 200) });
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        const ip = newPath + '[' + i + ']';
        if (typeof item === 'string' && foldTr(item).includes(query)) {
          results.push({ path: ip, content: item.slice(0, 200) });
        } else if (typeof item === 'object') {
          results.push(..._searchInObject(item, query, ip));
        }
      });
    } else if (typeof val === 'object' && val !== null) {
      results.push(..._searchInObject(val, query, newPath));
    }
  }
  return results;
}

function _searchFiles(dir, query, sourceLabel) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const hits = _searchInObject(data, foldTr(query), '');
      for (const h of hits) {
        results.push({ source: sourceLabel, file, path: h.path, content: h.content });
      }
    } catch { /* skip corrupt files */ }
  }
  return results;
}

function _searchSessions(query, maxResults) {
  const results = [];
  if (!fs.existsSync(SESSION_DIR)) return results;
  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    if (results.length >= maxResults) break;
    try {
      const session = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, file), 'utf8'));
      const msgs = session.messages || [];
      for (const msg of msgs) {
        const text = msg.content || '';
        if (typeof text === 'string' && foldTr(text).includes(foldTr(query))) {
          results.push({
            source: 'session', file, role: msg.role || '?',
            preview: text.slice(0, 200),
          });
          if (results.length >= maxResults) break;
        }
      }
    } catch { /* skip corrupt */ }
  }
  return results;
}

// ── Bridge to JSON fact store (memory_write) ──────────────────────────────
function _loadJsonFacts(username) {
  try {
    const file = path.join(MEMORY_DIR, `${foldTr(username || 'default')}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return { facts: [], name: null };
}

function _saveJsonFact(username, fact, category) {
  try {
    const file = path.join(MEMORY_DIR, `${foldTr(username || 'default')}.json`);
    const mem = _loadJsonFacts(username);
    const now = new Date().toISOString();
    const existing = mem.facts.find(f => foldTr(f.value || '') === foldTr(fact));
    if (existing) { existing.score = Math.min(10, (existing.score || 5) + 2); existing.updatedAt = now; }
    else { mem.facts.push({ value: fact, score: 5, category: category || 'personal', createdAt: now, updatedAt: now }); }
    if (mem.facts.length > 50) mem.facts.sort((a,b) => (b.score||0)-(a.score||0)).slice(0, 50);
    if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(mem, null, 2));
    return { success: true, file };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function execute(args) {
  const store = getMemoryStore();
  const { action, target = 'memory', content, oldContent, scope, maxResults = 10, username } = args;

  switch (action) {
    case 'add': {
      if (!content) return JSON.stringify({ success: false, error: 'content required for add' });
      // Bridge: also save to JSON fact store for target=user
      const bridge = target === 'user' ? _saveJsonFact(username || 'default', content, 'personal') : null;
      const storeResult = store.add(target, content);
      if (!bridge) return storeResult;
      const parsed = typeof storeResult === 'string' ? JSON.parse(storeResult) : storeResult;
      parsed.bridge = bridge;
      if (!bridge.success) {
        parsed.partial = parsed.success;
        parsed.success = false;
        parsed.error = parsed.error || 'Memory entry ana depoya yazildi, ancak JSON bridge yazimi basarisiz oldu';
      }
      return typeof storeResult === 'string' ? JSON.stringify(parsed) : parsed;
    }
    case 'remove':
      if (!content) return JSON.stringify({ success: false, error: 'content required for remove' });
      return store.remove(target, content);
    case 'replace':
      if (!content || !oldContent) return JSON.stringify({ success: false, error: 'content and oldContent required for replace' });
      return store.replace(target, oldContent, content);
    case 'list': {
      // Bridge: include JSON facts for target=user
      let result = store.list(target);
      if (target === 'user') {
        try {
          const parsed = typeof result === 'string' ? JSON.parse(result) : result;
          if (parsed.success) {
            const jsonMem = _loadJsonFacts(username || 'default');
            if (jsonMem.facts && jsonMem.facts.length > 0) {
              const storedFacts = jsonMem.facts.map(f => `- ${f.value} (onem: ${f.score || 5})`);
              parsed.entries.push('--- JSON hafiza ---');
              parsed.entries.push(...storedFacts);
              parsed.count = parsed.entries.length;
              result = JSON.stringify(parsed);
            }
          }
        } catch {}
      }
      return result;
    }
    case 'search': {
      if (!content) return JSON.stringify({ success: false, error: 'content (query) required for search' });
      const s = scope || 'all';
      const results = [];
      if (s === 'all' || s === 'memory') {
        const memHits = _searchFiles(MEMORY_DIR, content, 'memory');
        results.push(...memHits);
      }
      if (s === 'all' || s === 'sessions') {
        const sessHits = _searchSessions(content, maxResults);
        results.push(...sessHits);
      }
      return JSON.stringify({ success: true, query: content, count: results.length, results: results.slice(0, maxResults) });
    }
    default:
      return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
  }
}

module.exports = { name, description, inputSchema, execute };
