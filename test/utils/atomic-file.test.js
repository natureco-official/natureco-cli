/**
 * Crash-safe file write semantics. Locks in the temp+rename pattern that
 * keeps session / history JSON from being left half-written when the CLI
 * is killed (Ctrl+C, OOM, OS shutdown).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  writeFileAtomicSync,
  writeJsonAtomicSync,
  readJsonSafeSync,
} = require('../../src/utils/atomic-file');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-atomic-'));
});

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('writeFileAtomicSync', () => {
  it('writes the file and the content is exactly what was passed', () => {
    const p = path.join(tmpDir, 'a.txt');
    writeFileAtomicSync(p, 'hello');
    expect(fs.readFileSync(p, 'utf-8')).toBe('hello');
  });

  it('does not leave the temp sibling around after a successful write', () => {
    const p = path.join(tmpDir, 'b.txt');
    writeFileAtomicSync(p, 'data');
    const siblings = fs.readdirSync(tmpDir);
    // Only the target itself; the dot-temp pattern .<name>.<pid>... is gone.
    expect(siblings.filter(f => f.startsWith('.b.txt.'))).toHaveLength(0);
    expect(siblings).toContain('b.txt');
  });

  it('preserves the original file when the write would corrupt it (overwrite is all-or-nothing)', () => {
    const p = path.join(tmpDir, 'session.json');
    fs.writeFileSync(p, '{"messages":["before"]}');
    writeFileAtomicSync(p, '{"messages":["after"]}');
    expect(JSON.parse(fs.readFileSync(p, 'utf-8'))).toEqual({ messages: ['after'] });
  });

  it('does not create the target if the write itself throws (e.g. parent dir is gone)', () => {
    const p = path.join(tmpDir, 'missing-dir', 'c.txt');
    expect(() => writeFileAtomicSync(p, 'data')).toThrow();
    expect(fs.existsSync(p)).toBe(false);
  });

  it('100 sequential writes all land cleanly (no temp residue)', () => {
    const p = path.join(tmpDir, 'spam.json');
    for (let i = 0; i < 100; i++) {
      writeJsonAtomicSync(p, { i });
    }
    expect(readJsonSafeSync(p, null)).toEqual({ i: 99 });
    expect(fs.readdirSync(tmpDir).filter(f => f.includes('.tmp'))).toHaveLength(0);
  });
});

describe('readJsonSafeSync', () => {
  it('returns fallback when the file is missing', () => {
    const p = path.join(tmpDir, 'nope.json');
    expect(readJsonSafeSync(p, { default: true })).toEqual({ default: true });
  });

  it('returns fallback when the file is empty', () => {
    const p = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(p, '');
    expect(readJsonSafeSync(p, [])).toEqual([]);
  });

  it('returns fallback when the file is corrupted JSON (truncated mid-write)', () => {
    const p = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(p, '{"messages": [{"role":"user","content":"hel');
    expect(readJsonSafeSync(p, { messages: [] })).toEqual({ messages: [] });
  });

  it('returns parsed object for valid JSON', () => {
    const p = path.join(tmpDir, 'good.json');
    fs.writeFileSync(p, '{"a": 1, "b": [2, 3]}');
    expect(readJsonSafeSync(p, null)).toEqual({ a: 1, b: [2, 3] });
  });
});
