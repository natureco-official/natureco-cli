const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COMMITMENTS_FILE = path.join(os.homedir(), '.natureco', 'commitments.json');

function load() {
  if (!fs.existsSync(COMMITMENTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(COMMITMENTS_FILE, 'utf-8')); }
  catch { return []; }
}

function save(items) {
  const dir = path.dirname(COMMITMENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(COMMITMENTS_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function commitments(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listC();
  if (action === 'add') return addC(params.join(' '));
  if (action === 'check' || action === 'done') return checkC(params[0]);
  if (action === 'resolve') return resolveC(params[0]);
  if (action === 'pending') return pendingC();
  if (action === 'summary') return summaryC();
  if (action === 'delete') return deleteC(params[0]);

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco commitments [list|add|check|resolve|pending|summary|delete]\n'));
  process.exit(1);
}

function listC() {
  const items = load();
  console.log(chalk.cyan('\n  📋 Commitments\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  if (items.length === 0) {
    console.log(chalk.gray('  Henüz commitment yok.\n'));
    return;
  }
  for (const c of items) {
    const icon = c.status === 'resolved' ? '✅' : c.status === 'checked' ? '☑️ ' : '⬜';
    console.log(`  ${icon} ${chalk[c.status === 'resolved' ? 'gray' : 'white'](c.text)}`);
    console.log(chalk.gray(`     [${c.id}] ${c.createdAt.slice(0, 10)}`));
  }
  console.log();
}

function addC(text) {
  if (!text) {
    console.log(chalk.red('\n  ❌ Commitment text gerekli\n'));
    process.exit(1);
  }
  const items = load();
  const c = { id: genId(), text, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null };
  items.push(c);
  save(items);
  console.log(chalk.green(`\n  ✅ Commitment eklendi: ${c.id}\n`));
  console.log(`  ${chalk.white(c.text)}`);
  console.log();
}

function checkC(id) {
  if (!id) {
    console.log(chalk.red('\n  ❌ Commitment ID gerekli\n'));
    process.exit(1);
  }
  const items = load();
  const c = items.find(x => x.id === id);
  if (!c) { console.log(chalk.red(`\n  ❌ Commitment bulunamadı: ${id}\n`)); process.exit(1); }
  if (c.status === 'resolved') { console.log(chalk.yellow(`\n  ⚠️  "${c.text}" zaten çözülmüş\n`)); return; }
  c.status = 'checked';
  save(items);
  console.log(chalk.green(`\n  ☑️  "${c.text}" tamamlandı olarak işaretlendi\n`));
}

function resolveC(id) {
  if (!id) {
    const items = load();
    const pending = items.filter(x => x.status !== 'resolved');
    if (pending.length === 0) { console.log(chalk.gray('\n  Çözülecek commitment yok\n')); return; }
    for (const c of pending) {
      c.status = 'resolved';
      c.resolvedAt = new Date().toISOString();
    }
    save(items);
    console.log(chalk.green(`\n  ✅ ${pending.length} commitment çözüldü\n`));
    return;
  }
  const items = load();
  const c = items.find(x => x.id === id);
  if (!c) { console.log(chalk.red(`\n  ❌ Commitment bulunamadı: ${id}\n`)); process.exit(1); }
  c.status = 'resolved';
  c.resolvedAt = new Date().toISOString();
  save(items);
  console.log(chalk.green(`\n  ✅ "${c.text}" çözüldü\n`));
}

function pendingC() {
  const items = load().filter(c => c.status !== 'resolved');
  console.log(chalk.cyan('\n  ⏳ Bekleyen Commitments\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  if (items.length === 0) {
    console.log(chalk.gray('  Bekleyen commitment yok.\n'));
    return;
  }
  for (const c of items) {
    console.log(`  ${chalk.white(c.text)}`);
    console.log(chalk.gray(`     [${c.id}] ${c.createdAt.slice(0, 10)}\n`));
  }
}

function summaryC() {
  const items = load();
  const total = items.length;
  const resolved = items.filter(c => c.status === 'resolved').length;
  const checked = items.filter(c => c.status === 'checked').length;
  const pending = total - resolved - checked;
  console.log(chalk.cyan('\n  📊 Commitments Summary\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Toplam:')}   ${total}`);
  console.log(`  ${chalk.green('Çözülen:')}  ${resolved}`);
  console.log(`  ${chalk.yellow('Kontrol:')}  ${checked}`);
  console.log(`  ${chalk.cyan('Kalan:')}    ${pending}`);
  console.log();
}

function deleteC(id) {
  if (!id) {
    console.log(chalk.red('\n  ❌ Commitment ID gerekli\n'));
    process.exit(1);
  }
  let items = load();
  const idx = items.findIndex(x => x.id === id);
  if (idx === -1) { console.log(chalk.red(`\n  ❌ Commitment bulunamadı: ${id}\n`)); process.exit(1); }
  const removed = items.splice(idx, 1)[0];
  save(items);
  console.log(chalk.gray(`\n  🗑️  "${removed.text}" silindi\n`));
}

module.exports = commitments;
