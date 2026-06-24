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
  // ripgrep varsa onu kullan, yoksa fallback grep
  const useRipgrep = await checkCommand('rg');

  if (useRipgrep) {
    return await grepWithRipgrep(pattern, cwd, caseSensitive, includePattern, maxResults);
  }
  return await grepWithFallback(pattern, cwd, caseSensitive, maxResults);
}

async function checkCommand(cmd) {
  return new Promise((resolve) => {
    const proc = spawn('which', [cmd]);
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
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

async function grepWithFallback(pattern, cwd, caseSensitive, maxResults) {
  return new Promise((resolve) => {
    const args = ['-r', '-n', caseSensitive ? '' : '-i'];
    if (process.platform === 'darwin') args.push('-E');
    else args.push('-E');
    args.push(pattern);
    args.push(cwd);

    const proc = spawn('grep', args);
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

    proc.on('close', (code) => {
      const results = [];
      const lines = stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        if (results.length >= maxResults) break;
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          results.push({ file: match[1], line: parseInt(match[2]), text: match[3] });
        }
      }
      resolve({ success: true, pattern, tool: 'grep', count: results.length, results });
    });
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
};