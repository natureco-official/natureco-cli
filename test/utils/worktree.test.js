import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('worktree', () => {
  let worktree;

  beforeEach(() => {
    delete require.cache[require.resolve('../../src/utils/worktree')];
    worktree = require('../../src/utils/worktree');
    const wt = worktree.getWorktree();
    if (wt.active) { try { wt.exit({ merge: false }); } catch {} }
    wt.active = null;
    wt.history = [];
    wt._mockGitRepo = false; // Force copytree for tests
  });

  afterEach(() => {
    const wt = worktree.getWorktree();
    if (wt.active) { try { wt.exit({ merge: false }); } catch {} }
  });

  describe('enter', () => {
    it('enters worktree with copytree strategy', () => {
      const wt = worktree.getWorktree();
      const result = wt.enter({ id: 'test-1' });
      expect(result.error).toBeUndefined();
      expect(wt.active).not.toBeNull();
      expect(wt.active.id).toBe('test-1');
      expect(wt.active.strategy).toBe('copytree');
      expect(wt.active.dir).toContain('worktrees');
      wt.exit({ merge: false });
    });

    it('rejects nested entry', () => {
      const wt = worktree.getWorktree();
      wt.enter({ id: 'test-1' });
      const result = wt.enter({ id: 'test-2' });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Zaten worktree aktif');
      wt.exit({ merge: false });
    });

    it('creates worktree directory', () => {
      const wt = worktree.getWorktree();
      wt.enter({ id: 'test-dir' });
      expect(fs.existsSync(wt.active.dir)).toBe(true);
      wt.exit({ merge: false });
    });
  });

  describe('exit', () => {
    it('exits worktree and cleans up', () => {
      const wt = worktree.getWorktree();
      wt.enter({ id: 'test-exit' });
      expect(wt.active).not.toBeNull();
      wt.exit({ merge: false });
      expect(wt.active).toBeNull();
    });

    it('returns error when no active worktree', () => {
      const wt = worktree.getWorktree();
      const result = wt.exit();
      expect(result.error).toBeDefined();
    });
  });

  describe('status', () => {
    it('shows inactive status when no worktree', () => {
      const wt = worktree.getWorktree();
      const status = wt.status();
      expect(status.active).toBe(false);
    });

    it('shows active worktree info', () => {
      const wt = worktree.getWorktree();
      wt.enter({ id: 'test-status' });
      const status = wt.status();
      expect(status.active).toBe(true);
      expect(status.id).toBe('test-status');
      expect(status.strategy).toBe('copytree');
      wt.exit({ merge: false });
    });
  });

  describe('resolvePath', () => {
    it('returns original path when no active worktree', () => {
      const wt = worktree.getWorktree();
      expect(wt.resolvePath('/tmp/test')).toBe('/tmp/test');
    });

    it('redirects path to worktree dir', () => {
      const wt = worktree.getWorktree();
      wt.enter({ id: 'test-resolve' });
      const cwd = process.cwd();
      const resolved = wt.resolvePath(path.join(cwd, 'src/index.js'));
      expect(resolved).toContain('worktrees/test-resolve');
      expect(resolved).toContain('src/index.js');
      wt.exit({ merge: false });
    });
  });
});
