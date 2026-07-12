'use strict';

const { Worktree } = require('./worktree');

class AgentWorkspaceManager {
  constructor(options = {}) { this.createWorktree = options.createWorktree || (() => new Worktree()); }

  async run(agentId, task, options = {}) {
    const worktree = this.createWorktree();
    if (options.gitRepo !== undefined) worktree._mockGitRepo = options.gitRepo;
    const entered = worktree.enter({ id: `agent-${agentId}` });
    if (entered.error) throw new Error(entered.error);
    try {
      const result = await task({ id: agentId, cwd: entered.worktreeDir, worktree });
      const exited = worktree.exit({ merge: options.merge === true });
      return { ok: true, result, workspace: entered.worktreeDir, merged: !!exited.merged };
    } catch (error) {
      try { worktree.exit({ merge: false }); } catch {}
      return { ok: false, error: error.message, workspace: entered.worktreeDir, merged: false };
    }
  }
}

module.exports = { AgentWorkspaceManager };
