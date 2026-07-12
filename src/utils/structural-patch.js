'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomicSync } = require('./atomic-file');

function hashContent(content) { return crypto.createHash('sha256').update(content).digest('hex'); }

class StructuralPatchEngine {
  constructor(options = {}) {
    this.history = new Map();
    this.maxHistory = options.maxHistory || 50;
  }

  inspect(filePath) {
    const target = path.resolve(filePath);
    if (!fs.existsSync(target)) return { exists: false, path: target, hash: null, content: '' };
    const content = fs.readFileSync(target, 'utf8');
    return { exists: true, path: target, hash: hashContent(content), content };
  }

  preview(filePath, operations, options = {}) {
    const state = this.inspect(filePath);
    if (options.expectedHash && options.expectedHash !== state.hash) {
      return { ok: false, error: 'conflict: file changed since it was read', expectedHash: options.expectedHash, actualHash: state.hash };
    }
    let updated = state.content;
    const changes = [];
    for (const [index, operation] of (operations || []).entries()) {
      const search = operation.search;
      const replacement = operation.replace ?? '';
      if (typeof search !== 'string' || search.length === 0) return { ok: false, error: `operation ${index}: search is required` };
      const occurrences = updated.split(search).length - 1;
      if (occurrences === 0) return { ok: false, error: `operation ${index}: search text not found` };
      if (occurrences > 1 && !operation.replaceAll) return { ok: false, error: `operation ${index}: search is ambiguous (${occurrences} matches)` };
      updated = operation.replaceAll ? updated.split(search).join(replacement) : updated.replace(search, replacement);
      changes.push({ index, occurrences: operation.replaceAll ? occurrences : 1, removedChars: search.length, addedChars: replacement.length });
    }
    return {
      ok: true, path: state.path, beforeHash: state.hash, afterHash: hashContent(updated),
      before: state.content, after: updated, changes,
      risk: changes.length > 10 || Math.abs(updated.length - state.content.length) > 10000 ? 'high' : changes.length > 3 ? 'medium' : 'low',
    };
  }

  apply(filePath, operations, options = {}) {
    const preview = this.preview(filePath, operations, options);
    if (!preview.ok || options.dryRun) return preview;
    const id = `patch_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    writeFileAtomicSync(preview.path, preview.after);
    this.history.set(id, { path: preview.path, content: preview.before, expectedHash: preview.afterHash });
    while (this.history.size > this.maxHistory) this.history.delete(this.history.keys().next().value);
    return { ok: true, id, path: preview.path, beforeHash: preview.beforeHash, afterHash: preview.afterHash, changes: preview.changes, risk: preview.risk };
  }

  rollback(id) {
    const entry = this.history.get(id);
    if (!entry) return { ok: false, error: `unknown patch: ${id}` };
    const current = this.inspect(entry.path);
    if (current.hash !== entry.expectedHash) return { ok: false, error: 'rollback conflict: file changed after patch', actualHash: current.hash };
    writeFileAtomicSync(entry.path, entry.content);
    this.history.delete(id);
    return { ok: true, id, path: entry.path, hash: hashContent(entry.content) };
  }
}

module.exports = { StructuralPatchEngine, hashContent };
