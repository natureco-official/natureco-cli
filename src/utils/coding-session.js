'use strict';

const fs = require('fs');
const path = require('path');
const TB = require('./token-budget');
const { writeFileAtomicSync } = require('./atomic-file');

class CodingSession {
  constructor(options = {}) {
    this.maxSnapshots = options.maxSnapshots || 20;
    this.snapshots = [];
    this.lastUserMessage = null;
  }

  rememberUserMessage(message) { if (message && !message.startsWith('/')) this.lastUserMessage = message; }
  retryMessage() { return this.lastUserMessage; }

  capture(filePath) {
    if (!filePath) return null;
    const target = path.resolve(filePath);
    const existed = fs.existsSync(target);
    const content = existed ? fs.readFileSync(target) : null;
    const snapshot = { path: target, existed, content, capturedAt: Date.now() };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
    return snapshot;
  }

  undo() {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return { ok: false, error: 'Geri alınacak değişiklik yok.' };
    if (snapshot.existed) writeFileAtomicSync(snapshot.path, snapshot.content);
    else if (fs.existsSync(snapshot.path)) fs.unlinkSync(snapshot.path);
    return { ok: true, path: snapshot.path, restored: snapshot.existed };
  }

  compact(messages) {
    const before = messages.length;
    const compacted = TB.smartTrim(messages);
    return { messages: compacted, before, after: compacted.length, removed: before - compacted.length };
  }

  riskSummary(toolCall) {
    const name = toolCall?.name || '';
    const args = toolCall?.input || {};
    const risks = [];
    if (name === 'write_file' || name === 'edit_file') risks.push('filesystem-write');
    if (name === 'bash' || name === 'shell_command') risks.push('command-execution');
    if (/\b(rm|delete|drop|truncate|chmod|chown)\b/i.test(args.command || '')) risks.push('destructive');
    return { level: risks.includes('destructive') ? 'high' : risks.length ? 'medium' : 'low', risks };
  }
}

module.exports = { CodingSession };
