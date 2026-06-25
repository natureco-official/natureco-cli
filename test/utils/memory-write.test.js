/**
 * memory_write tool — fact cap, decay, dedup, atomic persistence.
 *
 * The previous behavior silently truncated to the top-15 facts INSIDE
 * decayFacts BEFORE the new fact was pushed, so when the cap was
 * approached new writes were thrown away with no signal. This test
 * file locks the corrected behavior: cap is applied AFTER push, the
 * just-added fact is pinned, and breach is announced via stderr.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpHome;
let originalHome;
let mod; // re-require fresh per test so HOME-derived MEMORY_DIR is correct

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-mw-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  delete process.env.NATURECO_MAX_FACTS;
  process.env.NATURECO_QUIET_MEMORY = '1'; // silence warn for most tests
  // Drop the require cache so MEMORY_DIR (computed at require time) re-uses HOME
  delete require.cache[require.resolve('../../src/tools/memory_write')];
  mod = require('../../src/tools/memory_write');
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

describe('MAX_FACTS_PER_USER default + env override', () => {
  it('defaults to 50 when NATURECO_MAX_FACTS is unset', () => {
    expect(mod._internals.MAX_FACTS_PER_USER).toBe(50);
  });

  it('respects NATURECO_MAX_FACTS env override', () => {
    process.env.NATURECO_MAX_FACTS = '7';
    delete require.cache[require.resolve('../../src/tools/memory_write')];
    const m = require('../../src/tools/memory_write');
    expect(m._internals.MAX_FACTS_PER_USER).toBe(7);
  });
});

describe('enforceFactLimit', () => {
  it('is a no-op when count ≤ cap', () => {
    const memory = { facts: Array.from({ length: 10 }, (_, i) => ({ value: `f${i}`, score: 5, updatedAt: '2026-01-01' })) };
    const out = mod._internals.enforceFactLimit(memory);
    expect(out.facts).toHaveLength(10);
  });

  it('keeps highest-score first, drops lowest-score on overflow', () => {
    process.env.NATURECO_MAX_FACTS = '3';
    delete require.cache[require.resolve('../../src/tools/memory_write')];
    const m = require('../../src/tools/memory_write');
    const facts = [
      { value: 'low', score: 1, updatedAt: '2026-06-01' },
      { value: 'mid', score: 5, updatedAt: '2026-06-01' },
      { value: 'high', score: 9, updatedAt: '2026-06-01' },
      { value: 'med2', score: 4, updatedAt: '2026-06-01' },
    ];
    const out = m._internals.enforceFactLimit({ facts });
    expect(out.facts.map(f => f.value)).toEqual(['high', 'mid', 'med2']);
  });

  it('pins the recently-pushed fact even if its score is low', () => {
    process.env.NATURECO_MAX_FACTS = '3';
    delete require.cache[require.resolve('../../src/tools/memory_write')];
    const m = require('../../src/tools/memory_write');
    const facts = [
      { value: 'old-1', score: 9, updatedAt: '2026-06-01' },
      { value: 'old-2', score: 8, updatedAt: '2026-06-01' },
      { value: 'old-3', score: 7, updatedAt: '2026-06-01' },
      { value: 'JUST-WROTE', score: 5, updatedAt: '2026-06-25' },
    ];
    const out = m._internals.enforceFactLimit({ facts }, { recentValue: 'JUST-WROTE' });
    expect(out.facts.map(f => f.value)).toContain('JUST-WROTE');
    expect(out.facts).toHaveLength(3);
  });

  it('emits a stderr warn when capacity is breached and warn is enabled', () => {
    process.env.NATURECO_MAX_FACTS = '2';
    delete process.env.NATURECO_QUIET_MEMORY;
    delete require.cache[require.resolve('../../src/tools/memory_write')];
    const m = require('../../src/tools/memory_write');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const facts = [
      { value: 'a', score: 1, updatedAt: '2026-06-01' },
      { value: 'b', score: 2, updatedAt: '2026-06-01' },
      { value: 'c', score: 3, updatedAt: '2026-06-01' },
    ];
    m._internals.enforceFactLimit({ facts });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/cap 2 aşıldı/);
    warn.mockRestore();
  });
});

describe('addMemory end-to-end', () => {
  it('writes the file, dedups duplicates, and bumps score on repeat', () => {
    mod._internals.addMemory({ username: 'u1', fact: 'sevdiği renk kırmızı' });
    mod._internals.addMemory({ username: 'u1', fact: 'sevdiği renk kırmızı' });
    const mem = mod._internals.loadMemory('u1');
    expect(mem.facts).toHaveLength(1);
    expect(mem.facts[0].score).toBe(7); // 5 + 2 bump
  });

  it('does NOT silently drop the new fact when cap is full (the original bug)', () => {
    process.env.NATURECO_MAX_FACTS = '3';
    delete require.cache[require.resolve('../../src/tools/memory_write')];
    const m = require('../../src/tools/memory_write');
    // Fill at the cap with high-score facts
    m._internals.addMemory({ username: 'u2', fact: 'old A', score: 9 });
    m._internals.addMemory({ username: 'u2', fact: 'old B', score: 9 });
    m._internals.addMemory({ username: 'u2', fact: 'old C', score: 9 });
    // Push a 4th, low-score, fresh fact
    const result = m._internals.addMemory({ username: 'u2', fact: 'BRAND NEW', score: 4 });
    expect(result.success).toBe(true);
    const mem = m._internals.loadMemory('u2');
    expect(mem.facts.map(f => f.value)).toContain('BRAND NEW');
    expect(mem.facts).toHaveLength(3);
  });

  it('persists via atomic write (no temp residue in memory dir)', () => {
    mod._internals.addMemory({ username: 'u3', fact: 'foo' });
    const dir = path.join(tmpHome, '.natureco', 'memory');
    const entries = fs.readdirSync(dir);
    expect(entries.filter(e => e.includes('.tmp'))).toHaveLength(0);
    expect(entries).toContain('u3.json');
  });
});
