const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.natureco', 'sessions');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sessions(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return cmdList();
  if (action === 'show') return cmdShow(params[0]);
  if (action === 'cleanup') return cmdCleanup();
  if (action === 'prune') return cmdPrune(parseInt(params[0], 10));

  console.log(chalk.red(`\n  Unknown sessions action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco sessions <action> [params]'));
  console.log(chalk.gray('  Actions: list, show <id>, cleanup, prune <days>\n'));
  process.exit(1);
}

function getSessions() {
  ensureDir(SESSIONS_DIR);
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  const sessions = [];
  for (const file of files) {
    const fp = path.join(SESSIONS_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      sessions.push({ id: path.basename(file, '.json'), file, data });
    } catch {}
  }
  return sessions;
}

function cmdList() {
  const sessions = getSessions();

  console.log(chalk.cyan(`\n  Sessions (${sessions.length})\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (sessions.length === 0) {
    console.log(chalk.gray('  No sessions found.\n'));
    return;
  }

  for (const s of sessions) {
    const msgCount = (s.data.messages || []).length;
    const preview = s.data.preview || s.data.id || s.id;
    const updated = s.data.updatedAt || s.data.savedAt || '';
    console.log(`  ${chalk.white(s.id)}`);
    console.log(chalk.gray(`    Messages: ${msgCount}  ·  ${preview.toString().slice(0, 60)}`));
    if (updated) console.log(chalk.gray(`    Updated: ${updated.slice(0, 10)}`));
  }
  console.log('');
}

function cmdShow(id) {
  if (!id) {
    console.log(chalk.red('\n  Usage: natureco sessions show <id>\n'));
    process.exit(1);
  }

  const sessions = getSessions();
  const found = sessions.find(s => s.id.includes(id));

  if (!found) {
    console.log(chalk.yellow(`\n  Session not found: ${id}\n`));
    return;
  }

  console.log(chalk.cyan(`\n  Session: ${found.id}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  const msgs = found.data.messages || [];
  console.log(`  ${chalk.white('Messages:')}  ${chalk.cyan(msgs.length)}`);
  for (const msg of msgs.slice(-10)) {
    const role = msg.role === 'user' ? chalk.green('You') : chalk.cyan('Bot');
    const content = (msg.content || '').slice(0, 200);
    console.log(`  ${role}: ${chalk.white(content)}`);
  }
  if (msgs.length > 10) console.log(chalk.gray(`  ... and ${msgs.length - 10} more`));
  console.log('');
}

function cmdCleanup() {
  const sessions = getSessions();
  let removed = 0;

  for (const s of sessions) {
    const msgs = s.data.messages || [];
    if (msgs.length === 0) {
      try {
        fs.unlinkSync(path.join(SESSIONS_DIR, s.file));
        removed++;
      } catch {}
    }
  }

  console.log(chalk.gray(`\n  Cleaned up ${removed} empty session(s).\n`));
}

function cmdPrune(days) {
  if (!days || isNaN(days) || days < 1) {
    console.log(chalk.red('\n  Usage: natureco sessions prune <days>\n'));
    process.exit(1);
  }

  const cutoff = Date.now() - days * 86400000;
  const sessions = getSessions();
  let removed = 0;

  for (const s of sessions) {
    const ts = s.data.updatedAt || s.data.savedAt || '';
    if (ts && new Date(ts).getTime() < cutoff) {
      try {
        fs.unlinkSync(path.join(SESSIONS_DIR, s.file));
        removed++;
      } catch {}
    }
  }

  console.log(chalk.gray(`\n  Pruned ${removed} session(s) older than ${days} day(s).\n`));
}

module.exports = sessions;
