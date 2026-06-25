/**
 * memory-store — Hermes-style flat-file memory (MEMORY.md / USER.md)
 *
 * Two stores:
 *   - MEMORY.md: agent's notes (environment facts, project conventions, tool quirks)
 *   - USER.md: what the agent knows about the user (preferences, habits, workflow)
 *
 * Entry delimiter: § (section sign). Multiline entries allowed.
 *
 * Frozen snapshot pattern:
 *   - System prompt gets a snapshot captured at session start (never changes mid-session)
 *   - Tool responses reflect live state (mutations write to disk immediately)
 *   - Prefix cache stays stable for the entire session
 *   - Snapshot refreshes on next session start
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memories');
const ENTRY_DELIMITER = '\n§\n';

class MemoryStore {
  constructor(charLimit = 3000) {
    this._memoryEntries = [];
    this._userEntries = [];
    this._charLimit = charLimit;
    this._snapshot = { memory: '', user: '' };
  }

  _ensureDir() {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }

  _pathFor(target) {
    return target === 'user'
      ? path.join(MEMORY_DIR, 'USER.md')
      : path.join(MEMORY_DIR, 'MEMORY.md');
  }

  _readEntries(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    return content.split(ENTRY_DELIMITER).map(e => e.trim()).filter(Boolean);
  }

  _writeEntries(filePath, entries) {
    this._ensureDir();
    const content = entries.join(ENTRY_DELIMITER);
    fs.writeFileSync(filePath, content + '\n', 'utf8');
  }

  _renderBlock(label, entries) {
    if (!entries || entries.length === 0) return '';
    return `=== ${label} ===\n${entries.join('\n')}\n=== ${label} sonu ===`;
  }

  load() {
    this._ensureDir();
    this._memoryEntries = this._readEntries(this._pathFor('memory'));
    this._userEntries = this._readEntries(this._pathFor('user'));
    this._memoryEntries = [...new Map(this._memoryEntries.map(e => [e, e])).values()];
    this._userEntries = [...new Map(this._userEntries.map(e => [e, e])).values()];
    this._snapshot = {
      memory: this._renderBlock('memory', this._memoryEntries),
      user: this._renderBlock('user', this._userEntries),
    };
  }

  getSnapshot() {
    return this._snapshot;
  }

  getSystemPromptBlock() {
    const parts = [];
    if (this._snapshot.memory) parts.push(this._snapshot.memory);
    if (this._snapshot.user) parts.push(this._snapshot.user);
    return parts.join('\n\n');
  }

  list(target) {
    const entries = target === 'user' ? this._userEntries : this._memoryEntries;
    return JSON.stringify({ success: true, entries, count: entries.length });
  }

  add(target, content) {
    if (!content || !content.trim()) {
      return JSON.stringify({ success: false, error: 'Content cannot be empty.' });
    }
    content = content.trim();
    const entries = target === 'user' ? this._userEntries : this._memoryEntries;
    if (entries.includes(content)) {
      return JSON.stringify({ success: false, error: 'Duplicate entry.' });
    }
    const currentTotal = entries.reduce((sum, e) => sum + e.length + 3, 0);
    if (currentTotal + content.length > this._charLimit) {
      return JSON.stringify({ success: false, error: `Memory ${target} is full (limit ~${this._charLimit} chars). Remove some entries first.` });
    }
    entries.push(content);
    this._writeEntries(this._pathFor(target), entries);
    return JSON.stringify({ success: true, message: 'Memory entry added.', count: entries.length });
  }

  remove(target, content) {
    if (!content || !content.trim()) {
      return JSON.stringify({ success: false, error: 'Content cannot be empty.' });
    }
    content = content.trim();
    const entries = target === 'user' ? this._userEntries : this._memoryEntries;
    const idx = entries.findIndex(e => e.includes(content));
    if (idx === -1) {
      return JSON.stringify({ success: false, error: 'No matching entry found.' });
    }
    const removed = entries.splice(idx, 1);
    this._writeEntries(this._pathFor(target), entries);
    return JSON.stringify({ success: true, message: 'Memory entry removed.', removed: removed[0] });
  }

  replace(target, oldContent, newContent) {
    if (!oldContent || !newContent) {
      return JSON.stringify({ success: false, error: 'Both old and new content required.' });
    }
    oldContent = oldContent.trim();
    newContent = newContent.trim();
    const entries = target === 'user' ? this._userEntries : this._memoryEntries;
    const idx = entries.findIndex(e => e.includes(oldContent));
    if (idx === -1) {
      return JSON.stringify({ success: false, error: 'No matching entry found.' });
    }
    entries[idx] = newContent;
    this._writeEntries(this._pathFor(target), entries);
    return JSON.stringify({ success: true, message: 'Memory entry updated.' });
  }
}

let _defaultStore = null;

function getMemoryStore() {
  if (!_defaultStore) {
    _defaultStore = new MemoryStore();
    _defaultStore.load();
  }
  return _defaultStore;
}

function resetMemoryStore() {
  _defaultStore = null;
}

module.exports = { MemoryStore, getMemoryStore, resetMemoryStore, ENTRY_DELIMITER };
