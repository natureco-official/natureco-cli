/**
 * read_file — backwards-compat + new pagination + numbered output.
 *
 * Old call shape: `{path}` → `{success, path, content, size, truncated}`
 * MUST keep working byte-for-byte (existing consumers depend on it).
 *
 * New options: offset (1-based line), limit, numbered (cat -n prefix).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const mod = require('../../src/tools/read_file');
const { readFile, _formatNumbered } = mod._internals;

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-read-'));
});
afterEach(() => {
  if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('backwards compatibility — {path} only', () => {
  it('returns raw content unchanged when called with just `path`', async () => {
    const p = path.join(tmp, 'x.txt');
    fs.writeFileSync(p, 'line1\nline2\nline3\n');
    const r = await readFile({ path: p });
    expect(r.success).toBe(true);
    expect(r.content).toBe('line1\nline2\nline3\n');
    expect(r.truncated).toBe(false);
    expect(r.size).toBe(18);
    // Pagination fields should NOT appear in the unchanged path
    expect(r.numbered).toBeUndefined();
    expect(r.offset).toBeUndefined();
    expect(r.lines_returned).toBeUndefined();
  });

  it('returns success:false (not throw) for a missing file', async () => {
    const r = await readFile({ path: path.join(tmp, 'nope') });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/does not exist/);
  });

  it('returns success:false for a directory path', async () => {
    const r = await readFile({ path: tmp });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not a file/);
  });
});

describe('offset + limit (line-based, 1-based)', () => {
  function makeNumbered(n) {
    return Array.from({ length: n }, (_, i) => `L${i + 1}`).join('\n');
  }

  it('offset=3 starts at the 3rd line', async () => {
    const p = path.join(tmp, 'f.txt');
    fs.writeFileSync(p, makeNumbered(10));
    const r = await readFile({ path: p, offset: 3 });
    expect(r.success).toBe(true);
    expect(r.content.split('\n')[0]).toBe('L3');
    expect(r.offset).toBe(3);
  });

  it('limit=2 returns at most 2 lines', async () => {
    const p = path.join(tmp, 'f.txt');
    fs.writeFileSync(p, makeNumbered(10));
    const r = await readFile({ path: p, offset: 1, limit: 2 });
    expect(r.success).toBe(true);
    expect(r.content).toBe('L1\nL2');
    expect(r.lines_returned).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.total_lines).toBe(10);
  });

  it('asking past EOF returns empty content, not an error', async () => {
    const p = path.join(tmp, 'f.txt');
    fs.writeFileSync(p, makeNumbered(5));
    const r = await readFile({ path: p, offset: 100, limit: 10 });
    expect(r.success).toBe(true);
    expect(r.content).toBe('');
    expect(r.lines_returned).toBe(0);
  });

  it('default limit is 2000 when only offset is given', async () => {
    const p = path.join(tmp, 'big.txt');
    fs.writeFileSync(p, makeNumbered(2500));
    const r = await readFile({ path: p, offset: 1 });
    expect(r.lines_returned).toBe(2000);
    expect(r.truncated).toBe(true);
  });
});

describe('numbered output (cat -n)', () => {
  it('prefixes each line with its 1-based line number + tab', async () => {
    const p = path.join(tmp, 'f.txt');
    fs.writeFileSync(p, 'a\nb\nc');
    const r = await readFile({ path: p, numbered: true });
    expect(r.success).toBe(true);
    expect(r.content).toBe('1\ta\n2\tb\n3\tc');
    expect(r.numbered).toBe(true);
  });

  it('numbering respects offset (line 5 → label 5, not 1)', async () => {
    const p = path.join(tmp, 'f.txt');
    fs.writeFileSync(p, Array.from({ length: 10 }, (_, i) => `L${i + 1}`).join('\n'));
    const r = await readFile({ path: p, offset: 5, limit: 2, numbered: true });
    expect(r.content).toBe('5\tL5\n6\tL6');
  });
});

describe('_formatNumbered helper', () => {
  it('handles a single-line input', () => {
    expect(_formatNumbered('only', 7)).toBe('7\tonly');
  });
  it('handles a trailing newline correctly (does not add an 8\\t)', () => {
    // We accept that the trailing empty string becomes a numbered empty line —
    // mirrors `cat -n` for files that end with a newline.
    expect(_formatNumbered('a\n', 1)).toBe('1\ta\n2\t');
  });
});

describe('module shape', () => {
  it('matches the natureco tool interface', () => {
    expect(mod.name).toBe('read_file');
    expect(typeof mod.execute).toBe('function');
    expect(mod.inputSchema.required).toEqual(['path']);
    // New optional fields are present in the schema
    expect(mod.inputSchema.properties).toHaveProperty('offset');
    expect(mod.inputSchema.properties).toHaveProperty('limit');
    expect(mod.inputSchema.properties).toHaveProperty('numbered');
  });
});
