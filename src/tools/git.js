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
    // v5.6.22: Git repo otomatik bul - this baglami kayboldugu icin module-level helper kullan
    const cwd = findGitRepo();
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
  },

  /**
   * v5.6.22: Git repo bul - cwd'de yoksa ~/Projects ve parent dizinleri tara
   */
  _findGitRepo() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execSync } = require('child_process');

    // 1. Mevcut cwd'de .git var mi?
    if (fs.existsSync(path.join(process.cwd(), '.git'))) {
      return process.cwd();
    }

    // 2. Bilinen yaygin konumlari kontrol et
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Projects', 'natureco-cli'),
      path.join(home, 'Projects'),
      path.join(home, 'projects'),
      path.join(home, 'code'),
      path.join(home, 'dev'),
      path.join(home, 'src'),
    ];

    for (const dir of candidates) {
      try {
        if (fs.existsSync(path.join(dir, '.git'))) {
          return dir;
        }
      } catch {}
    }

    // 3. cwd'den yukarı dogru 5 seviye tara
    let current = process.cwd();
    for (let i = 0; i < 5; i++) {
      const parent = path.dirname(current);
      if (parent === current) break;
      try {
        if (fs.existsSync(path.join(parent, '.git'))) {
          return parent;
        }
      } catch {}
      current = parent;
    }

    // 4. Bulamadi, cwd'yi don
    return process.cwd();
  }
};


/**
 * Git repo bul - cwd'de yoksa ~/Projects ve parent dizinleri tara
 */
function findGitRepo() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  if (fs.existsSync(path.join(process.cwd(), '.git'))) {
    return process.cwd();
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, 'Projects', 'natureco-cli'),
    path.join(home, 'Projects'),
    path.join(home, 'projects'),
    path.join(home, 'code'),
    path.join(home, 'dev'),
    path.join(home, 'src'),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, '.git'))) {
        return dir;
      }
    } catch {}
  }

  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    try {
      if (fs.existsSync(path.join(parent, '.git'))) {
        return parent;
      }
    } catch {}
    current = parent;
  }

  return process.cwd();
}
