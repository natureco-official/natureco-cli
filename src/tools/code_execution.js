/**
 * Code Execution — Python/Node kodu sandbox'ta çalıştır (v4.9.0)
 *
 * Hermes'ın execute_code'una benzer.
 * Kullanıcı "Python ile X yap" derse çalıştırır.
 */

const { spawn } = require('child_process');
const os = require('os');

function getInterpreterCandidates(language, code, platform = process.platform) {
  const isWin = platform === 'win32';
  if (language === 'python') {
    const bins = isWin ? ['py', 'python', 'python3'] : ['python3', 'python'];
    return bins.map(bin => ({ bin, args: ['-c', code] }));
  }
  if (language === 'node') return [{ bin: process.execPath, args: ['-e', code] }];
  if (language === 'bash' || language === 'shell') {
    if (isWin) {
      // Prefer a real bash when installed; plain Windows falls back to its established
      // PowerShell command surface. runCode reports the interpreter so this is explicit.
      return [
        { bin: 'bash', args: ['-c', code] },
        { bin: 'powershell', args: ['-NoProfile', '-Command', code], fallback: true },
      ];
    }
    return ['bash', 'sh'].map(bin => ({ bin, args: ['-c', code] }));
  }
  return null;
}

/**
 * Kod çalıştır, çıktıyı ve hataları döndür.
 * @param code - Çalıştırılacak kod
 * @param language - 'python', 'node', 'bash' (default: otomatik tespit)
 * @param timeoutMs - Timeout (default 30s)
 */
async function runCode({ code, language = 'auto', timeoutMs = 30000, cwd = null }) {
  if (!code) return { success: false, error: 'code gerekli' };

  // Dil tespiti
  if (language === 'auto') {
    if (/^import |^from |def |print\(/m.test(code) || code.includes('python')) {
      language = 'python';
    } else if (/require\(|^const |^let |^var |console\./m.test(code)) {
      language = 'node';
    } else if (/^(ls|cat|echo|grep|find|cd|mkdir)/m.test(code)) {
      language = 'bash';
    } else {
      language = 'bash';
    }
  }

  // v5.38: Yorumlayici adaylari — platformlar arasi saglam.
  // node icin process.execPath her zaman mevcut; python icin Windows'ta py/python
  // (python3 App-execution-alias tuzagina duser), *nix'te python3/python.
  const candidates = getInterpreterCandidates(language, code);
  if (!candidates) return { success: false, error: `Desteklenmeyen dil: ${language}` };

  const truncated = (s) => s.length > 8000 ? s.slice(0, 8000) + '\n... (kesildi, ' + (s.length - 8000) + ' karakter daha)' : s;

  const spawnOnce = (candidate) => new Promise((resolve) => {
    let stdout = '', stderr = '', proc;
    try {
      proc = spawn(candidate.bin, candidate.args, { cwd: cwd || os.homedir(), timeout: timeoutMs, env: { ...process.env, FORCE_COLOR: '0' } });
    } catch (e) { return resolve({ notFound: true, err: e.message }); }
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('error', (e) => resolve({ notFound: /ENOENT/i.test(e.message), err: e.message }));
    proc.on('close', (exitCode) => resolve({
      // 9009 (win) / 127 (*nix) veya alias mesaji = yorumlayici yok → sonraki adaya gec
      notFound: exitCode === 9009 || exitCode === 127 || /not found|not recognized|install from the Microsoft Store/i.test(stderr),
      exitCode, stdout, stderr,
    }));
  });

  let r = { notFound: true };
  let usedCandidate;
  for (const candidate of candidates) {
    r = await spawnOnce(candidate);
    usedCandidate = candidate;
    if (!r.notFound) break; // yorumlayici bulundu (basarili ya da kod hatasi) — bunu kullan
  }
  if (r.notFound) {
    const nice = language === 'python' ? 'Python bu sistemde kurulu degil.' : `${language} yorumlayicisi bulunamadi.`;
    return { success: false, language, error: `${nice} (denenen: ${candidates.map(candidate => candidate.bin).join(', ')})` };
  }
  return {
    success: r.exitCode === 0,
    language,
    interpreter: usedCandidate.bin,
    interpreterFallback: usedCandidate.fallback === true,
    exitCode: r.exitCode,
    stdout: truncated(r.stdout).trim(),
    stderr: truncated(r.stderr).trim(),
    output: truncated(r.stdout + (r.stderr ? '\n[STDERR]: ' + r.stderr : '')).trim(),
  };
}

module.exports = {
  name: 'code_execution',
  description: 'Python/Node/Bash kodu sandbox\'ta çalıştır. Windows\'ta bash yoksa PowerShell fallback kullanılır ve gerçek interpreter döndürülür.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Çalıştırılacak kod' },
      language: { type: 'string', description: 'Dil: python, node, bash (default: otomatik tespit)', enum: ['auto', 'python', 'node', 'bash'] },
      timeoutMs: { type: 'number', description: 'Timeout ms (default 30000)' },
      cwd: { type: 'string', description: 'Çalışma dizini (default: home)' },
    },
    required: ['code'],
  },
  async execute(params) {
    return await runCode(params);
  },
  _getInterpreterCandidates: getInterpreterCandidates,
};
