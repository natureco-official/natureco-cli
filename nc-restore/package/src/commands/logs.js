const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_FILE = path.join(os.homedir(), '.natureco', 'natureco.log');

function ensureLog() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8');
}

function logs(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'show') return cmdShow(params[0] ? parseInt(params[0], 10) : 50);
  if (action === 'tail') return cmdTail();
  if (action === 'search') return cmdSearch(params.join(' '));
  if (action === 'clear') return cmdClear();
  if (action === 'path') return cmdPath();

  console.log(chalk.red(`\n  Unknown logs action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco logs <action> [params]'));
  console.log(chalk.gray('  Actions: tail, show <lines>, search <term>, clear, path\n'));
  process.exit(1);
}

function cmdShow(lines) {
  ensureLog();
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const allLines = content.split('\n').filter(l => l.trim());

  if (lines < 1) lines = 50;
  const last = allLines.slice(-lines);

  console.log(chalk.cyan(`\n  Logs (last ${last.length} of ${allLines.length} lines)\n`));
  for (const line of last) {
    printColoredLine(line);
  }
  console.log('');
}

function cmdTail() {
  ensureLog();
  console.log(chalk.cyan('\n  Tailing log file... (Ctrl+C to stop)\n'));
  let lastSize = fs.statSync(LOG_FILE).size;

  const watcher = setInterval(() => {
    try {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > lastSize) {
        const fd = fs.openSync(LOG_FILE, 'r');
        const buf = Buffer.alloc(stat.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        const newLines = buf.toString('utf8').split('\n').filter(l => l.trim());
        for (const line of newLines) printColoredLine(line);
        lastSize = stat.size;
      }
    } catch {}
  }, 500);

  process.on('SIGINT', () => {
    clearInterval(watcher);
    console.log(chalk.gray('\n  Tail stopped.\n'));
    process.exit(0);
  });
}

function cmdSearch(term) {
  if (!term) {
    console.log(chalk.red('\n  Usage: natureco logs search <term>\n'));
    process.exit(1);
  }

  ensureLog();
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const lower = term.toLowerCase();
  const results = lines.filter(l => l.toLowerCase().includes(lower));

  if (results.length === 0) {
    console.log(chalk.yellow(`\n  No matches for "${term}"\n`));
    return;
  }

  console.log(chalk.cyan(`\n  Found ${results.length} match(es) for "${term}"\n`));
  for (const line of results.slice(-50)) {
    const idx = line.toLowerCase().indexOf(lower);
    if (idx === -1) { printColoredLine(line); continue; }
    const before = line.slice(0, idx);
    const match = line.slice(idx, idx + term.length);
    const after = line.slice(idx + term.length);
    console.log(chalk.gray('  ') + chalk.gray(before) + chalk.yellow(match) + chalk.gray(after));
  }
  console.log('');
}

function cmdClear() {
  ensureLog();
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  console.log(chalk.gray('\n  Log file cleared.\n'));
}

function cmdPath() {
  console.log(chalk.cyan(`\n  Log file: ${LOG_FILE}\n`));
}

function printColoredLine(line) {
  if (line.includes('[error]') || line.includes('ERROR') || line.includes('❌')) {
    console.log(chalk.red('  ' + line));
  } else if (line.includes('[warn]') || line.includes('WARN') || line.includes('⚠')) {
    console.log(chalk.yellow('  ' + line));
  } else if (line.includes('[info]') || line.includes('INFO')) {
    console.log(chalk.cyan('  ' + line));
  } else {
    console.log(chalk.gray('  ' + line));
  }
}

module.exports = logs;
