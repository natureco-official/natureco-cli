const { execFileSync } = require('child_process');

// v5.38 GUVENLIK: args'i shell'e sokmadan token'lara ayir. execFileSync shell:false ile
// calisir; boylece ";", "&&", "|", "$()", backtick gibi metakarakterler ISLEM GORMEZ —
// komut enjeksiyonu imkansiz. (Eski execSync `git log ${args}` enjeksiyona aciktir.)
function tokenizeArgs(s) {
  if (!s) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(s))) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

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

  execute({ operation, args = '', message = '', command = '', cwd: userCwd = '' }) {
    // v5.6.22: Git repo otomatik bul - this baglami kayboldugu icin module-level helper kullan
    // v5.38: ajan bir cwd verdiyse ve orada .git varsa onu kullan; yoksa oradan yukari tara.
    const cwd = findGitRepo(userCwd);
    // v5.38: Esnek giris — ajanlar farkli formatlarda gonderebilir (operation yerine args/command
    // icinde "log -n 2" gibi). operation yoksa ilk token'i operation kabul et, gerisi args olur.
    if (!operation && (command || args)) {
      const raw = String(command || args).trim().replace(/^git\s+/i, '');
      const m = raw.match(/^([a-z][a-z-]*)\s*([\s\S]*)$/i);
      if (m) { operation = m[1].toLowerCase(); if (m[2].trim()) args = m[2].trim(); }
    }
    operation = String(operation || '').toLowerCase();
    const tok = tokenizeArgs(args);
    try {
      let gitArgs;
      switch (operation) {
        case 'status':  gitArgs = ['status', '--short']; break;
        case 'diff':    gitArgs = ['diff', ...(tok.length ? tok : ['HEAD'])]; break;
        case 'log':     gitArgs = ['log', '--oneline', ...(tok.length ? tok : ['-10'])]; break;
        case 'branch':
        case 'branches': gitArgs = ['branch', '-a']; break;
        case 'add':     gitArgs = ['add', ...(tok.length ? tok : ['.'])]; break;
        case 'commit':  gitArgs = ['commit', '-m', String(message || '')]; break;
        // v5.38: yaygin salt-okunur alt-komutlar (ajan bunlari da isteyebiliyor)
        case 'show':      gitArgs = ['show', ...(tok.length ? tok : ['HEAD'])]; break;
        case 'remote': {
          // GUVENLIK: remote yazma islemleri (add/set-url/remove/rename) engelli — push
          // zeminini ve exec-allowlist bypass'ini kapatir. Sadece salt-okunur.
          const sub = (tok[0] || '').toLowerCase();
          if (['add', 'set-url', 'remove', 'rm', 'rename', 'prune', 'set-head', 'set-branches'].includes(sub)) {
            return { success: false, error: `git remote "${sub}" engellendi (guvenlik: remote yazma yasak)` };
          }
          gitArgs = ['remote', ...(tok.length ? tok : ['-v'])]; break;
        }
        case 'tag':       gitArgs = ['tag', ...tok]; break;
        case 'describe':  gitArgs = ['describe', ...(tok.length ? tok : ['--tags', '--always'])]; break;
        case 'rev-parse': gitArgs = ['rev-parse', ...(tok.length ? tok : ['HEAD'])]; break;
        default: return { success: false, error: `Bilinmeyen git islemi: "${operation}". Gecerli: status, diff, log, branch, add, commit, show, remote, tag, describe, rev-parse` };
      }
      // shell:false (execFile default) → args ne olursa olsun shell yorumlamaz.
      const output = execFileSync('git', gitArgs, { cwd, stdio: 'pipe', encoding: 'utf8' });
      return { success: true, output: (output || '').trim() };
    } catch (err) {
      return { success: false, error: err.stderr?.toString() || err.message };
    }
  },

  // v5.38: test icin — shell'e gitmeden token'lara ayirma davranisini dogrulamak icin
  _tokenizeArgs: tokenizeArgs,

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
function findGitRepo(startDir = '') {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // v5.38: ajanin verdigi cwd oncelikli — orada .git varsa onu, yoksa oradan yukari tara.
  const seed = startDir && fs.existsSync(startDir) ? startDir : process.cwd();
  if (fs.existsSync(path.join(seed, '.git'))) {
    return seed;
  }

  const home = os.homedir();
  const candidates = [
    // v5.38: makineden bagimsiz — env ipuclari once (repo dizini disindan calisilsa bile bulunur)
    process.env.NATURECO_PROJECT_DIR,
    process.env.INIT_CWD,
    process.env.PWD,
    path.join(home, 'Projects', 'natureco-cli'),
    path.join(home, 'Projects'),
    path.join(home, 'projects'),
    path.join(home, 'code'),
    path.join(home, 'dev'),
    path.join(home, 'src'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, '.git'))) {
        return dir;
      }
    } catch {}
  }

  let current = seed;
  for (let i = 0; i < 6; i++) {
    const parent = path.dirname(current);
    if (parent === current) break;
    try {
      if (fs.existsSync(path.join(parent, '.git'))) {
        return parent;
      }
    } catch {}
    current = parent;
  }

  return seed;
}
