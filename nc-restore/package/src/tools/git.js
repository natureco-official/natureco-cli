const { execSync } = require('child_process');

module.exports = {
  name: 'git',
  description: 'Git operations: status, diff, log, branch list, commit',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'diff', 'log', 'branches', 'add', 'commit'],
        description: 'Git operation to perform'
      },
      args: { type: 'string', description: 'Additional arguments' },
      message: { type: 'string', description: 'Commit message (for commit operation)' }
    },
    required: ['operation']
  },

  execute({ operation, args = '', message = '' }) {
    const cwd = process.cwd();
    try {
      let cmd;
      switch (operation) {
        case 'status':  cmd = 'git status --short'; break;
        case 'diff':    cmd = `git diff ${args || 'HEAD'}`; break;
        case 'log':     cmd = `git log --oneline ${args || '-10'}`; break;
        case 'branches': cmd = 'git branch -a'; break;
        case 'add':     cmd = `git add ${args || '.'}`; break;
        case 'commit':  cmd = `git commit -m "${message.replace(/"/g, '\\"')}"`; break;
        default: return { success: false, error: 'Unknown operation' };
      }
      const output = execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
      return { success: true, output: output.trim() };
    } catch (err) {
      return { success: false, error: err.stderr?.toString() || err.message };
    }
  }
};
