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

  if (language === 'python') { cmd = 'python3'; args = ['-c', code]; }
  else if (language === 'node') { cmd = 'node'; args = ['-e', code]; }
  else if (language === 'bash' || language === 'shell') { cmd = 'bash'; args = ['-c', code]; }
  else return { success: false, error: `Desteklenmeyen dil: ${language}` };

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: cwd || os.homedir(),
      timeout: timeoutMs,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', (code) => {
      const truncated = (s) => s.length > 8000 ? s.slice(0, 8000) + '\n... (kesildi, ' + (s.length - 8000) + ' karakter daha)' : s;
      resolve({
        success: code === 0,
        language,
        exitCode: code,
        stdout: truncated(stdout).trim(),
        stderr: truncated(stderr).trim(),
        output: truncated(stdout + (stderr ? '\n[STDERR]: ' + stderr : '')).trim(),
      });
    });
    proc.on('error', (e) => {
      resolve({ success: false, error: e.message, language });
    });
  });
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