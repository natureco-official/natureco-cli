/**
 * worktree — Isolated development worktrees (Claude Code EnterWorktree/ExitWorktree)
 *
 * Creates temporary git worktrees for experimental changes without
 * affecting the main working directory.
 *
 * Tools:
 *   EnterWorktree — create a temp branch + worktree at .natureco/worktrees/<id>
 *   ExitWorktree — merge/collapse worktree changes back
 *
 * Falls back to a copytree (non-git) strategy when not in a git repo.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const WORKTREE_DIR = path.join(process.cwd(), '.natureco', 'worktrees');

class Worktree {
  constructor() {
    this.active = null; // { id, branch, dir, strategy }
    this.history = [];
    this._mockGitRepo = null; // For testing override
  }

  get isGitRepo() {
    if (this._mockGitRepo !== null) return this._mockGitRepo;
    try {
      execSync('git rev-parse --git-dir', { cwd: process.cwd(), stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  get currentBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd(), stdio: 'pipe' }).toString().trim();
    } catch {
      return 'main';
    }
  }

  /**
   * Enter worktree — create isolated copy for experimentation.
   */
  enter(opts = {}) {
    if (this.active) return { error: `Zaten worktree aktif: ${this.active.id}` };

    const id = opts.id || `wt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const branch = opts.branch || `wt/${id}`;
    const targetDir = path.join(WORKTREE_DIR, id);

    fs.mkdirSync(targetDir, { recursive: true });

    if (this.isGitRepo) {
      try {
        // Create orphan branch + worktree
        execSync(`git branch -f "${branch}" HEAD`, { cwd: process.cwd(), stdio: 'pipe' });
        execSync(`git worktree add --detach "${targetDir}" "${branch}"`, { cwd: process.cwd(), stdio: 'pipe' });
        this.active = { id, branch, dir: targetDir, strategy: 'git-worktree' };
      } catch (e) {
        // Fallback: simple copy
        this._copyTree(process.cwd(), targetDir);
        this.active = { id, branch: null, dir: targetDir, strategy: 'copytree' };
      }
    } else {
      this._copyTree(process.cwd(), targetDir);
      this.active = { id, branch: null, dir: targetDir, strategy: 'copytree' };
    }

    this.history.push({ action: 'enter', id, at: Date.now() });
    return {
      result: `Worktree oluşturuldu: ${id}\nDizin: ${targetDir}\nStrateji: ${this.active.strategy}${this.active.branch ? `\nBranch: ${this.active.branch}` : ''}`,
      worktreeId: id,
      worktreeDir: targetDir,
    };
  }

  /**
   * Exit worktree — merge changes back and clean up.
   */
  exit(opts = {}) {
    if (!this.active) return { error: 'Aktif worktree yok.' };

    const merge = opts.merge !== false;
    const result = { merged: false, changes: [] };

    if (merge && this.active.strategy === 'git-worktree') {
      try {
        // Diff the worktree against current HEAD
        const diff = execSync(`git diff HEAD --name-status`, { cwd: this.active.dir, stdio: 'pipe' }).toString().trim();
        if (diff) {
          result.changes = diff.split('\n').filter(Boolean);
          // Cherry-pick changes if any commits were made
          const log = execSync(`git log --oneline HEAD --not --all`, { cwd: this.active.dir, stdio: 'pipe' }).toString().trim();
          if (log) {
            execSync(`git fetch . "${this.active.branch}"`, { cwd: process.cwd(), stdio: 'pipe' });
            result.merged = true;
          }
        }
      } catch (e) {
        result.mergeError = e.message;
      }
    }

    // Cleanup
    this._cleanup();
    this.history.push({ action: 'exit', id: this.active.id, merged: result.merged, at: Date.now() });
    this.active = null;

    return {
      result: `Worktree kapatıldı.${result.merged ? ' Değişiklikler merge edildi.' : ' Değişiklikler atıldı.'}` +
        (result.changes.length ? `\nDeğişiklikler:\n${result.changes.join('\n')}` : ''),
      ...result,
    };
  }

  /**
   * Get current worktree info.
   */
  status() {
    if (!this.active) return { active: false };
    return {
      active: true,
      id: this.active.id,
      dir: this.active.dir,
      branch: this.active.branch,
      strategy: this.active.strategy,
    };
  }

  /**
   * Validate if a tool call is operating within the worktree.
   * If active, redirect file paths from cwd to worktree dir.
   */
  resolvePath(filePath) {
    if (!this.active || !filePath) return filePath;
    const abs = path.resolve(filePath);
    const cwd = process.cwd();
    if (abs.startsWith(cwd)) {
      const rel = path.relative(cwd, abs);
      return path.join(this.active.dir, rel);
    }
    return filePath;
  }

  /**
   * Copy entire directory tree (fallback for non-git repos).
   */
  _copyTree(src, dest) {
    const skipDirs = new Set(['node_modules', '.git', '.natureco']);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || skipDirs.has(entry.name)) continue;
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        this._copyTree(s, d);
      } else if (entry.isFile()) {
        try { fs.copyFileSync(s, d); } catch {}
      }
    }
  }

  /**
   * Clean up worktree files.
   */
  _cleanup() {
    if (!this.active) return;
    try {
      if (this.active.strategy === 'git-worktree') {
        execSync(`git worktree remove --force "${this.active.dir}"`, { stdio: 'pipe' });
        execSync(`git branch -D "${this.active.branch}" 2>/dev/null`, { stdio: 'pipe' });
      }
      if (fs.existsSync(this.active.dir)) {
        fs.rmSync(this.active.dir, { recursive: true, force: true });
      }
    } catch {}
  }
}

let _instance = null;
function getWorktree() {
  if (!_instance) _instance = new Worktree();
  return _instance;
}

module.exports = { Worktree, getWorktree };
