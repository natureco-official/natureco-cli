const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');
const INDEX_FILE = path.join(MEMORY_DIR, 'index.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function memory(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return cmdStatus();
  if (action === 'index') return cmdIndex();
  if (action === 'search') return cmdSearch(params.join(' '));

  console.log(chalk.red(`\n  Unknown memory action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco memory <action> [params]'));
  console.log(chalk.gray('  Actions: status, index, search <query>\n'));
  process.exit(1);
}

function cmdStatus() {
  ensureDir(MEMORY_DIR);
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  let totalSize = 0;

  for (const file of files) {
    const fp = path.join(MEMORY_DIR, file);
    try { totalSize += fs.statSync(fp).size; } catch {}
  }

  console.log(chalk.cyan('\n  Memory Store Status\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Files:')}     ${chalk.cyan(files.length)}`);
  console.log(`  ${chalk.white('Size:')}      ${chalk.cyan(formatSize(totalSize))}`);
  console.log(`  ${chalk.white('Location:')}  ${chalk.gray(MEMORY_DIR)}`);
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log('');
}

function cmdIndex() {
  ensureDir(MEMORY_DIR);
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  const index = [];

  for (const file of files) {
    const fp = path.join(MEMORY_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      index.push({
        file,
        keywords: extractKeywords(data),
        size: fs.statSync(fp).size,
        updated: fs.statSync(fp).mtime.toISOString(),
      });
    } catch {}
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
  console.log(chalk.green(`\n  Index rebuilt: ${index.length} entries\n`));
}

function cmdSearch(query) {
  if (!query) {
    console.log(chalk.red('\n  Usage: natureco memory search <query>\n'));
    process.exit(1);
  }

  if (!fs.existsSync(MEMORY_DIR)) {
    console.log(chalk.yellow('\n  No memory directory found.\n'));
    return;
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  const lower = query.toLowerCase();
  let results = [];

  for (const file of files) {
    const fp = path.join(MEMORY_DIR, file);
    try {
      const content = fs.readFileSync(fp, 'utf8');
      if (content.toLowerCase().includes(lower)) {
        const data = JSON.parse(content);
        results.push({ file, data });
      }
    } catch {}
  }

  if (results.length === 0) {
    console.log(chalk.yellow(`\n  No results for "${query}"\n`));
    return;
  }

  console.log(chalk.cyan(`\n  Found ${results.length} memory file(s) for "${query}"\n`));
  for (const r of results) {
    console.log(`  ${chalk.white(r.file)}`);
    const keys = Object.keys(r.data).filter(k => {
      const v = typeof r.data[k] === 'string' ? r.data[k] : JSON.stringify(r.data[k]);
      return v.toLowerCase().includes(lower);
    });
    for (const k of keys) {
      console.log(chalk.gray(`    ${k}: ${r.data[k]}`));
    }
  }
  console.log('');
}

function extractKeywords(data) {
  const words = new Set();
  for (const val of Object.values(data)) {
    if (typeof val === 'string') {
      val.split(/\s+/).filter(w => w.length > 3).forEach(w => words.add(w.toLowerCase()));
    }
  }
  return [...words];
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

module.exports = memory;
