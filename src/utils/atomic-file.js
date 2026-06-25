/**
 * Crash-safe file write + safe read.
 *
 * Why this exists: `fs.writeFileSync(path, data)` is NOT atomic. If the
 * process is killed mid-write (SIGTERM, OOM, power loss) the file is
 * left truncated, which becomes a "corrupted session" on next load
 * (JSON.parse throws and session history is lost).
 *
 * `writeFileAtomicSync(path, data)` writes to a temp sibling first, then
 * `rename(2)`s it into place — atomic on POSIX when both paths are on
 * the same filesystem (always true here, since the temp is in the same
 * directory).
 *
 * `readFileSafeSync(path, fallback)` returns the parsed JSON or falls
 * back gracefully on missing/corrupted files instead of throwing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function _tempName(target) {
  // Same directory so rename(2) is atomic. Include pid+rand to avoid
  // collisions if two processes write the same file.
  const dir = path.dirname(target);
  const base = path.basename(target);
  const suffix = `${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  return path.join(dir, `.${base}.${suffix}`);
}

/**
 * Atomically write a string/Buffer to `filePath`.
 * On error the temp file is cleaned up and the original is untouched.
 *
 * @param {string} filePath
 * @param {string|Buffer} data
 * @param {{encoding?: BufferEncoding, mode?: number}} [opts]
 */
function writeFileAtomicSync(filePath, data, opts = {}) {
  const encoding = opts.encoding ?? 'utf-8';
  const mode = opts.mode; // undefined → fs default
  const tmp = _tempName(filePath);
  try {
    if (mode !== undefined) {
      fs.writeFileSync(tmp, data, { encoding, mode });
    } else {
      fs.writeFileSync(tmp, data, encoding);
    }
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup; if the temp already vanished, ignore.
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Read `filePath` as JSON; return `fallback` on missing or corrupt.
 *
 * @template T
 * @param {string} filePath
 * @param {T} fallback
 * @returns {T | object | Array<any>}
 */
function readJsonSafeSync(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Convenience: stringify + atomic write. Pretty-printed for human-edit
 * friendliness (matches the existing JSON.stringify(..., null, 2) calls).
 *
 * @param {string} filePath
 * @param {any} value
 */
function writeJsonAtomicSync(filePath, value) {
  writeFileAtomicSync(filePath, JSON.stringify(value, null, 2));
}

module.exports = {
  writeFileAtomicSync,
  writeJsonAtomicSync,
  readJsonSafeSync,
};
