/**
 * grep_search — İçerik araması (ripgrep tarzı) (v4.9.0)
 *
 * Hermes'ın search_files'ine benzer ama içerik arar.
 * "TODO" kelimesini tüm src/ içinde ara gibi.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Dosya içinde pattern ara
 * @param pattern - Aranacak metin veya regex
 * @param path - Aranacak dosya/klasör yolu
 * @param caseSensitive - Case sensitive (default false)
 * @param maxResults - Max sonuç (default 50)
 */
async function grepSearch({ pattern, path: searchPath = null, caseSensitive = false, includePattern = null, maxResults = 50 }) {
  if (!pattern) return { success: false, error: 'pattern gerekli' };

  // v5.6.22: ~ expansion fix
  if (searchPath && searchPath.startsWith('~')) {
    searchPath = path.join(require('os').homedir(), searchPath.slice(1));
  }

  // v5.6.22: Dosya yolu verildiyse, parent directory'yi kullan + filename pattern ekle
  let cwd = searchPath || process.cwd();
  if (searchPath && fs.existsSync(searchPath)) {
    const stat = fs.statSync(searchPath);
    if (stat.isFile()) {
      // Dosya -> parent dir + includePattern
      cwd = path.dirname(searchPath);
      if (!includePattern) {
        includePattern = path.basename(searchPath);
      }
    }
  }
  // ripgrep varsa onu kullan (hizli), yoksa SAF NODE fallback.
  // v5.39: eski fallback `grep` komutuydu → Windows'ta yok (Git Bash gerekir).
  // Artik hicbir Unix komutuna bagimli degil: rg opsiyonel hizlandirma.
  const useRipgrep = await checkCommand('rg');

  if (useRipgrep) {
    return await grepWithRipgrep(pattern, cwd, caseSensitive, includePattern, maxResults);
  }
  return grepWithNode(pattern, cwd, caseSensitive, includePattern, maxResults);
}

async function checkCommand(cmd) {
  // v5.39: `which`/`where` platform-farkini bypass et — komutu dogrudan --version ile
  // dene. PATH'te varsa 0 doner. (which Windows'ta yok, where *nix'te yok.)
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const proc = spawn(cmd, ['--version'], { stdio: 'ignore' });
      proc.on('close', code => fin(code === 0));
      proc.on('error', () => fin(false));
    } catch { fin(false); }
  });
}

// v5.39: SAF NODE icerik aramasi — platformdan ve harici komuttan bagimsiz.
function grepWithNode(pattern, cwd, caseSensitive, includePattern, maxResults) {
  const results = [];
  let re;
  const flags = caseSensitive ? 'g' : 'gi';
  try { re = new RegExp(pattern, flags); }
  catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); }
  let globRe = null;
  if (includePattern) {
    const esc = includePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    globRe = new RegExp('^' + esc + '$', 'i');
  }
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache', '.turbo']);
  const walk = (dir) => {
    if (results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= maxResults) break;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE.has(e.name)) walk(full); continue; }
      if (!e.isFile()) continue;
      if (globRe && !globRe.test(e.name)) continue;
      let content;
      try {
        if (fs.statSync(full).size > 2 * 1024 * 1024) continue; // 2MB üstü atla
        content = fs.readFileSync(full, 'utf8');
      } catch { continue; }
      if (content.includes('\x00')) continue; // ikili dosya (null byte)
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        if (re.test(lines[i])) {
          results.push({ file: full, line: i + 1, text: lines[i].trim().slice(0, 300) });
          if (results.length >= maxResults) break;
        }
      }
    }
  };
  const start = (fs.existsSync(cwd) && fs.statSync(cwd).isFile()) ? path.dirname(cwd) : cwd;
  walk(start);
  return { success: true, pattern, tool: 'node', count: results.length, results };
}

async function grepWithRipgrep(pattern, cwd, caseSensitive, includePattern, maxResults) {
  return new Promise((resolve) => {
    const args = [
      '--json',
      '--line-number',
      caseSensitive ? '' : '--ignore-case',
      '--no-heading',
    ].filter(Boolean);
    // v5.6.22: includePattern'i -g ve glob olarak ayri ekle (tirnak hatasini onler)
    if (includePattern) {
      args.push('-g', includePattern);
    }
    args.push(pattern);
    args.push(cwd);

    const proc = spawn('rg', args, { cwd });
    let stdout = '';
    let stderr = '';
    // v5.6.32: Memory taşmasını önle - max 5MB output
    let stdoutBytes = 0;
    const MAX_OUTPUT = 5 * 1024 * 1024; // 5MB
    let truncated = false;
    const addStdout = (d) => {
      if (truncated) return;
      stdoutBytes += d.length;
      if (stdoutBytes > MAX_OUTPUT) {
        truncated = true;
        stdout += '\n[OUTPUT TRUNCATED - exceeded 5MB limit]';
        return;
      }
      stdout += d.toString();
    };
    proc.stdout.on('data', addStdout);

    let finished = false;
    const finishOnce = () => {
      if (finished) return;
      finished = true;
      const results = [];
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        if (results.length >= maxResults) break;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'match') {
            results.push({
              file: obj.data.path.text,
              line: obj.data.line_number,
              text: obj.data.lines.text.trim(),
            });
          }
        } catch {}
      }
      resolve({ success: true, pattern, tool: 'ripgrep', count: results.length, results });
    };

    // v5.6.22: Promise ile stream okuma (race condition fix)
    let stderrClosed = false;
    let stdoutClosed = false;
    let exitCode = null;
    const checkFinish = () => {
      if ((stdoutClosed || stderrClosed) && exitCode !== null) {
        setTimeout(finishOnce, 100);
      }
    };
    proc.stdout.on('end', () => { stdoutClosed = true; checkFinish(); });
    proc.stderr.on('end', () => { stderrClosed = true; checkFinish(); });
    proc.on('exit', (code) => { exitCode = code; checkFinish(); });
    proc.on('error', (e) => resolve({ success: false, error: e.message }));
  });
}

module.exports = {
  name: 'grep_search',
  description: 'Dosya içeriklerinde pattern ara (ripgrep veya grep). Örn: pattern="TODO", path="~/projects".',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Aranacak metin veya regex' },
      path: { type: 'string', description: 'Aranacak dosya/klasör yolu (default: cwd)' },
      caseSensitive: { type: 'boolean', description: 'Büyük/küçük harf duyarlı (default: false)' },
      includePattern: { type: 'string', description: 'Glob filter (örn: "*.js")' },
      maxResults: { type: 'number', description: 'Max sonuç (default 50)' },
    },
    required: ['pattern'],
  },
  async execute(params) {
    return await grepSearch(params);
  },

  // v5.39: test icin — saf Node fallback'i rg'den bagimsiz dogrulamak icin
  _grepWithNode: grepWithNode,
};