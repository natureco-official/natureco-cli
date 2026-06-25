/**
 * edit_file tool — locks in the three rules:
 *   1. file must exist (no implicit create)
 *   2. old_string must be present (no silent no-op)
 *   3. old_string must be unique unless replace_all
 *
 * Plus: atomic write, identical-string rejection, empty-string rejection,
 * and a few real-world editing scenarios (multiline blocks, leading
 * whitespace preservation).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { editFile } = require('../../src/tools/edit_file')._internals;

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-edit-'));
});

afterEach(() => {
  if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('input validation', () => {
  it('rejects missing path', async () => {
    const r = await editFile({ old_string: 'a', new_string: 'b' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/path is required/);
  });

  it('rejects empty old_string', async () => {
    const r = await editFile({ path: '/tmp/x', old_string: '', new_string: 'y' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/old_string is required/);
  });

  it('rejects identical old_string and new_string', async () => {
    const p = path.join(tmp, 'x.txt');
    fs.writeFileSync(p, 'hello');
    const r = await editFile({ path: p, old_string: 'hello', new_string: 'hello' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/identical/);
  });
});

describe('file-existence guard', () => {
  it('refuses to create a missing file (use write_file for that)', async () => {
    const r = await editFile({ path: path.join(tmp, 'nope.txt'), old_string: 'a', new_string: 'b' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found/);
    expect(r.error).toMatch(/write_file/);
  });
});

describe('old_string presence + uniqueness', () => {
  it('errors with a helpful hint when old_string is not found', async () => {
    const p = path.join(tmp, 'src.js');
    fs.writeFileSync(p, 'const foo = 1;\nconst bar = 2;\n');
    const r = await editFile({ path: p, old_string: 'const BAZ', new_string: 'const baz' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found/);
    expect(r.hint).toMatch(/whitespace/);
    expect(r.file_excerpt).toContain('const foo');
  });

  it('errors when old_string appears multiple times and replace_all is false', async () => {
    const p = path.join(tmp, 'src.js');
    fs.writeFileSync(p, 'x = 1\nx = 2\nx = 3\n');
    const r = await editFile({ path: p, old_string: 'x = ', new_string: 'y = ' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not unique \(3 occurrences\)/);
    expect(r.occurrences).toBe(3);
  });

  it('replaces all when replace_all=true', async () => {
    const p = path.join(tmp, 'src.js');
    fs.writeFileSync(p, 'x = 1\nx = 2\nx = 3\n');
    const r = await editFile({ path: p, old_string: 'x = ', new_string: 'y = ', replace_all: true });
    expect(r.success).toBe(true);
    expect(r.replacements).toBe(3);
    expect(fs.readFileSync(p, 'utf8')).toBe('y = 1\ny = 2\ny = 3\n');
  });
});

describe('single replacement', () => {
  it('replaces the unique occurrence and preserves the rest of the file byte-for-byte', async () => {
    const p = path.join(tmp, 'src.js');
    const original = 'const foo = 1;\nconst bar = 2;\nfunction baz() { return foo + bar; }\n';
    fs.writeFileSync(p, original);
    const r = await editFile({ path: p, old_string: 'const foo = 1;', new_string: 'const foo = 42;' });
    expect(r.success).toBe(true);
    expect(r.replacements).toBe(1);
    expect(fs.readFileSync(p, 'utf8')).toBe(
      'const foo = 42;\nconst bar = 2;\nfunction baz() { return foo + bar; }\n'
    );
  });

  it('preserves leading whitespace exactly (the most common reason agents break edits)', async () => {
    const p = path.join(tmp, 'src.js');
    fs.writeFileSync(p, 'function f() {\n    const a = 1;\n    return a;\n}\n');
    const r = await editFile({
      path: p,
      old_string: '    const a = 1;\n    return a;',
      new_string: '    const a = 2;\n    const b = a + 1;\n    return b;',
    });
    expect(r.success).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toBe(
      'function f() {\n    const a = 2;\n    const b = a + 1;\n    return b;\n}\n'
    );
  });
});

describe('atomic write', () => {
  it('leaves no .tmp residue after a successful edit', async () => {
    const p = path.join(tmp, 'src.js');
    fs.writeFileSync(p, 'foo');
    await editFile({ path: p, old_string: 'foo', new_string: 'bar' });
    const residue = fs.readdirSync(tmp).filter(f => f.includes('.tmp'));
    expect(residue).toHaveLength(0);
  });
});

describe('module shape', () => {
  it('matches the natureco tool interface (name + execute + inputSchema)', () => {
    const mod = require('../../src/tools/edit_file');
    expect(mod.name).toBe('edit_file');
    expect(typeof mod.execute).toBe('function');
    expect(mod.inputSchema).toBeDefined();
    expect(mod.inputSchema.required).toEqual(['path', 'old_string', 'new_string']);
  });
});
