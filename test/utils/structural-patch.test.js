import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { StructuralPatchEngine } from '../../src/utils/structural-patch.js';

const dirs = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
function fixture(content) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-patch-')); dirs.push(dir); const file = path.join(dir, 'a.js'); fs.writeFileSync(file, content); return file; }

describe('structural patch engine', () => {
  test('applies an anchored patch and rolls it back', () => {
    const file = fixture('const value = 1;\n');
    const engine = new StructuralPatchEngine();
    const before = engine.inspect(file);
    const applied = engine.apply(file, [{ search: 'value = 1', replace: 'value = 2' }], { expectedHash: before.hash });
    expect(applied).toMatchObject({ ok: true, risk: 'low' });
    expect(fs.readFileSync(file, 'utf8')).toContain('value = 2');
    expect(engine.rollback(applied.id).ok).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('const value = 1;\n');
  });

  test('refuses stale, missing and ambiguous edits without writing', () => {
    const file = fixture('x x\n');
    const engine = new StructuralPatchEngine();
    expect(engine.apply(file, [{ search: 'x', replace: 'y' }]).error).toMatch(/ambiguous/);
    expect(engine.apply(file, [{ search: 'z', replace: 'y' }]).error).toMatch(/not found/);
    expect(engine.apply(file, [{ search: 'x', replace: 'y', replaceAll: true }], { expectedHash: 'stale' }).error).toMatch(/conflict/);
    expect(fs.readFileSync(file, 'utf8')).toBe('x x\n');
  });

  test('refuses rollback if another writer changed the patched file', () => {
    const file = fixture('a');
    const engine = new StructuralPatchEngine();
    const applied = engine.apply(file, [{ search: 'a', replace: 'b' }]);
    fs.writeFileSync(file, 'c');
    expect(engine.rollback(applied.id).error).toMatch(/rollback conflict/);
    expect(fs.readFileSync(file, 'utf8')).toBe('c');
  });
});
