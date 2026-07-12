const chalk = require('chalk');
const fs = require('fs');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const SESSIONS_FILE = path.join(os.homedir(), '.natureco', 'terminal-sessions.json');

function loadSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveSessions(sessions) {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function terminal(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'help') return showHelp();
  if (action === 'exec') return execCmd(params.join(' '));
  if (action === 'connect') return connectSession(params[0], params.slice(1).join(' '));
  if (action === 'disconnect') return disconnectSession(params[0]);
  if (action === 'list') return listSessions();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco terminal [exec|connect|disconnect|list]\n', '  Usage: natureco terminal [exec|connect|disconnect|list]\n')));
  process.exit(1);
}

function execCmd(cmd) {
  if (!cmd) {
    console.log(chalk.red(L('\n  ❌ Komut gerekli\n', '\n  ❌ Command required\n')));
    console.log(chalk.gray(L('  Örnek: natureco terminal exec "ls -la"\n', '  Example: natureco terminal exec "ls -la"\n')));
    process.exit(1);
  }
  console.log(chalk.cyan(`\n  🖥️  $ ${cmd}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  try {
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    if (output) console.log(output);
    console.log(chalk.green(`\n  ✅ ${L('Komut başarıyla tamamlandı', 'Command completed successfully')} (${output.length} bytes)\n`));
  } catch (err) {
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.log(chalk.red(err.stderr.toString()));
    console.log(chalk.red(`\n  ❌ ${L('Hata', 'Error')}: ${err.message}\n`));
  }
}

function connectSession(target, cmd) {
  if (!target) {
    console.log(chalk.red(L('\n  ❌ Hedef gerekli (örn: local, ssh://user@host)\n', '\n  ❌ Target required (e.g. local, ssh://user@host)\n')));
    process.exit(1);
  }

  const sessions = loadSessions();
  const existing = sessions.find(s => s.target === target && s.status === 'active');
  if (existing) {
    console.log(chalk.yellow(`\n  ⚠️  ${target} ${L('üzerinde zaten aktif oturum var', 'already has an active session')}: ${existing.id}\n`));
    return;
  }

  const session = { id: genId(), target, status: 'active', cmd: cmd || 'powershell', createdAt: new Date().toISOString() };
  sessions.push(session);
  saveSessions(sessions);

  console.log(chalk.green(`\n  ✅ ${L('Oturum başlatıldı', 'Session started')}: ${session.id}\n`));
  console.log(`  ${chalk.white('Target:')} ${target}`);
  console.log(`  ${chalk.white('Shell:')}  ${session.cmd}`);
  console.log();

  if (target === 'local' || target.startsWith('local')) {
    const shell = session.cmd;
    console.log(chalk.gray(`  ${shell} ${L('başlatılıyor... (Ctrl+D çıkış)', 'starting... (Ctrl+D to exit)')}\n`));
    try {
      const child = spawn(shell, [], { stdio: 'inherit', shell: true });
      child.on('exit', () => {
        session.status = 'closed';
        session.endedAt = new Date().toISOString();
        saveSessions(sessions);
        console.log(chalk.gray(`\n  ${L('Oturum sonlandı', 'Session ended')}: ${session.id}\n`));
      });
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${err.message}\n`));
    }
    return;
  }

  console.log(chalk.gray(`  ${L('Uzak oturum: ssh veya winrm ile', 'Remote session: connect via ssh or winrm to')} ${target}${L(' bağlanın', '')}\n`));
}

function disconnectSession(id) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) { console.log(chalk.red(`\n  ❌ ${L('Oturum bulunamadı', 'Session not found')}: ${id}\n`)); process.exit(1); }
  sessions[idx].status = 'closed';
  sessions[idx].endedAt = new Date().toISOString();
  saveSessions(sessions);
  console.log(chalk.gray(`\n  🛑 ${L('Oturum sonlandı', 'Session ended')}: ${id} — ${sessions[idx].target}\n`));
}

function listSessions() {
  const sessions = loadSessions();
  console.log(chalk.cyan('\n  📋 Terminal Sessions\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  if (sessions.length === 0) {
    console.log(chalk.gray(L('  Oturum bulunamadı.\n', '  No sessions found.\n')));
    return;
  }
  for (const s of sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
    const icon = s.status === 'active' ? chalk.green('●') : chalk.gray('○');
    console.log(`  ${icon} ${chalk.white(s.target)} — ${s.cmd}`);
    console.log(chalk.gray(`     [${s.id}] ${s.createdAt.slice(0, 16)}`));
  }
  console.log();
}

function showHelp() {
  console.log(chalk.cyan('\n  🖥️  Terminal\n'));
  console.log(chalk.gray('  Execute commands and manage terminal sessions.\n'));
  console.log(chalk.gray('  Usage: natureco terminal <action> [params]'));
  console.log(chalk.gray('\n  Actions:'));
  console.log(chalk.cyan('    exec <cmd>') + chalk.gray('              Run a shell command'));
  console.log(chalk.cyan('    connect <target> [shell]') + chalk.gray('  Start a session'));
  console.log(chalk.cyan('    disconnect <id>') + chalk.gray('         Close a session'));
  console.log(chalk.cyan('    list') + chalk.gray('                    List sessions'));
  console.log(chalk.gray('\n  Examples:'));
  console.log(chalk.gray('    natureco terminal exec "dir"'));
  console.log(chalk.gray('    natureco terminal connect local'));
  console.log(chalk.gray('    natureco terminal list\n'));
}

module.exports = terminal;
