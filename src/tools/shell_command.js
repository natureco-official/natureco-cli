/**
 * shell_command — Tek shell komutu çalıştır (v4.9.0)
 *
 * bash.js'den farkı: tek satır, hızlı, etkileşimsiz komutlar için.
 * "find / -name *.log", "ls -la", "df -h" gibi.
 */

const { spawn } = require('child_process');
const os = require('os');
const { isSafeCommand, checkCommand, isDangerousCommand } = require('../utils/approvals');

async function runShell({ command, cwd = null, timeoutMs = 10000 }) {
  if (!command) return { success: false, error: 'command gerekli' };

  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', command], {
      cwd: cwd || os.homedir(),
      timeout: timeoutMs,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', (code) => {
      const truncated = (s) => s.length > 8000 ? s.slice(0, 8000) + '\n... (kesildi)' : s;
      resolve({
        success: code === 0,
        command,
        exitCode: code,
        stdout: truncated(stdout).trim(),
        stderr: truncated(stderr).trim(),
      });
    });
    proc.on('error', (e) => resolve({ success: false, error: e.message, command }));
  });
}

module.exports = {
  name: 'shell_command',
  description: 'Tek shell komutu çalıştır (find, ls, grep, cat, df, ps, vb.). Etkileşimsiz komutlar için. 10s timeout.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Çalıştırılacak shell komutu (örn: "ls -la ~/Documents")' },
      cwd: { type: 'string', description: 'Çalışma dizini' },
      timeoutMs: { type: 'number', description: 'Timeout ms (default 10000)' },
    },
    required: ['command'],
  },
  async execute(params) {
    // v5.43 GÜVENLİK: shell_command da (bash.js gibi) onay/güvenlik akışından geçer.
    // Eski hali doğrudan spawn('bash',...) yapıp checkCommand/isDangerousCommand'ı
    // ATLIYORDU → model/prompt-injection bash yerine bunu çağırıp onaysız sınırsız
    // shell erişimi kazanabiliyordu ("Dangerous Command Approval" tamamen bypass).
    const command = params && params.command;
    if (!command || !command.trim()) return { success: false, error: 'command gerekli' };
    if (!isSafeCommand(command)) {
      const approval = await checkCommand(command, { agentId: (params && params.agentId) || 'default' });
      if (!approval.allowed) {
        return { success: false, error: `Komut güvenlik politikasıyla reddedildi (${approval.reason}). "natureco security" ile politikayı görüntüle.` };
      }
      if (isDangerousCommand(command)) {
        return { success: false, error: 'Tehlikeli komut engellendi. Gözden geçirip manuel çalıştırın.' };
      }
      if (approval.editedCommand && approval.editedCommand !== command) {
        return await runShell({ ...params, command: approval.editedCommand });
      }
    }
    return await runShell(params);
  },
};