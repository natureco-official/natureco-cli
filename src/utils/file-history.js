/**
 * file-history — File change history with undo support
 *
 * Snapshots files before edits and stores them in .natureco/history/
 * Supports undo via `file-restore` CLI command.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HISTORY_DIR = path.join(process.cwd(), '.natureco', 'history');
const MAX_SNAPSHOTS_PER_FILE = 20;

function ensureDir() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

/**
 * Flatten an absolute path into a single directory name.
 *
 * This used to be `path.relative(cwd, …)` with only forward slashes replaced,
 * which broke twice off the happy path: on Windows the `\` separators survived
 * and turned the key into a nested tree that `listAll` could not read back, and
 * a file outside the project produced a leading `..` that escaped the history
 * directory entirely. Normalize the separators and neutralize traversal.
 */
function snapshotKey(filePath) {
  const rel = path.relative(process.cwd(), path.resolve(filePath));
  return rel
    .split(/[\\/]/)
    .map(segment => (segment === '..' ? '__up__' : segment))
    .filter(segment => segment && segment !== '.')
    .join('__')
    .replace(/[:*?"<>|]/g, '_');
}

function getHistory(filePath) {
  const key = snapshotKey(filePath);
  const dir = path.join(HISTORY_DIR, key);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.snap'))
    .map(f => {
      const ts = parseInt(f.replace('.snap', ''), 10);
      const snapPath = path.join(dir, f);
      return { timestamp: ts, size: fs.statSync(snapPath).size, file: f };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function snapshot(filePath, content) {
  ensureDir();
  const key = snapshotKey(filePath);
  const dir = path.join(HISTORY_DIR, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${Date.now()}.snap`), content || '');

  // Prune old snapshots
  const snaps = fs.readdirSync(dir).filter(f => f.endsWith('.snap')).sort();
  while (snaps.length > MAX_SNAPSHOTS_PER_FILE) {
    const old = snaps.shift();
    try { fs.unlinkSync(path.join(dir, old)); } catch {}
  }
}

function restore(filePath, timestamp) {
  const key = snapshotKey(filePath);
  const snapPath = path.join(HISTORY_DIR, key, `${timestamp}.snap`);
  if (!fs.existsSync(snapPath)) return { error: 'Snapshot not found' };
  const content = fs.readFileSync(snapPath, 'utf8');
  fs.writeFileSync(path.resolve(filePath), content);
  return { restored: true, filePath, timestamp, size: content.length };
}

function listAll() {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const results = [];
  for (const entry of fs.readdirSync(HISTORY_DIR)) {
    const dir = path.join(HISTORY_DIR, entry);
    if (fs.statSync(dir).isDirectory()) {
      const snaps = fs.readdirSync(dir).filter(f => f.endsWith('.snap'));
      if (snaps.length > 0) {
        const filePath = entry.replace(/__/g, '/');
        results.push({ file: filePath, snapshots: snaps.length, latest: Math.max(...snaps.map(s => parseInt(s, 10))) });
      }
    }
  }
  return results;
}

module.exports = { snapshot, restore, getHistory, listAll };
