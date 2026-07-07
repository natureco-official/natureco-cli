/**
 * Code Execution — Python/Node kodu sandbox'ta çalıştır (v4.9.0)
 *
 * Hermes'ın execute_code'una benzer.
 * Kullanıcı "Python ile X yap" derse çalıştırır.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Kod çalıştır, çıktıyı ve hataları döndür.
 * @param code - Çalıştırılacak kod
 * @param language - 'python', 'node', 'bash' (default: otomatik tespit)
 * @param timeoutMs - Timeout (default 30s)
 */
async function runCode({ code, language = 'auto', timeoutMs = 30000, cwd = null }) {
  if (!code) return { success: false, error: 'code gerekli' };

  // Dil tespiti
  let cmd, args;
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
  const isWin = process.platform === 'win32';
  let candidates;
  if (language === 'python') { candidates = isWin ? ['py', 'python', 'python3'] : ['python3', 'python']; args = ['-c', code]; }
  else if (language === 'node') { candidates = [process.execPath]; args = ['-e', code]; }
  else if (language === 'bash' || language === 'shell') { candidates = isWin ? ['bash'] : ['bash', 'sh']; args = ['-c', code]; }
  else return { success: false, error: `Desteklenmeyen dil: ${language}` };

  const truncated = (s) => s.length > 8000 ? s.slice(0, 8000) + '\n... (kesildi, ' + (s.length - 8000) + ' karakter daha)' : s;

  const spawnOnce = (bin) => new Promise((resolve) => {
    let stdout = '', stderr = '', proc;
    try {
      proc = spawn(bin, args, { cwd: cwd || os.homedir(), timeout: timeoutMs, env: { ...process.env, FORCE_COLOR: '0' } });
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
  for (const bin of candidates) {
    r = await spawnOnce(bin);
    if (!r.notFound) break; // yorumlayici bulundu (basarili ya da kod hatasi) — bunu kullan
  }
  if (r.notFound) {
    const nice = language === 'python' ? 'Python bu sistemde kurulu degil.' : `${language} yorumlayicisi bulunamadi.`;
    return { success: false, language, error: `${nice} (denenen: ${candidates.join(', ')})` };
  }
  return {
    success: r.exitCode === 0,
    language,
    exitCode: r.exitCode,
    stdout: truncated(r.stdout).trim(),
    stderr: truncated(r.stderr).trim(),
    output: truncated(r.stdout + (r.stderr ? '\n[STDERR]: ' + r.stderr : '')).trim(),
  };
}

module.exports = {
  name: 'code_execution',
  description: 'Python/Node/Bash kodu sandbox\'ta çalıştır. Çıktıyı ve hataları döndürür.',
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
};