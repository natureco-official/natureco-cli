const chalk = require('chalk');
const tui = require('../utils/tui');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig, saveConfig } = require('../utils/config');

const APPROVALS_FILE = path.join(os.homedir(), '.natureco', 'approvals.json');
const ALLOWLIST_FILE = path.join(os.homedir(), '.natureco', 'approval-allowlist.json');

function loadQueue() {
  if (!fs.existsSync(APPROVALS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveQueue(items) {
  const dir = path.dirname(APPROVALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf-8')); }
  catch { return []; }
}

function saveAllowlist(patterns) {
  const dir = path.dirname(ALLOWLIST_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify(patterns, null, 2), 'utf-8');
}

function approvals(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listApprovals();
  if (action === 'pending') return listPending();
  if (action === 'approve') return approveReq(params[0]);
  if (action === 'reject') return rejectReq(params[0]);
  if (action === 'set-policy') return setPolicy(params[0]);
  if (action === 'add') return addReq(params.join(' '));
  if (action === 'get') return getReq(params[0]);
  if (action === 'set') return setPolicy(params[0]);
  if (action === 'allowlist' && params[0] === 'add') return allowlistAdd(params.slice(1).join(' '));
  if (action === 'allowlist' && params[0] === 'remove') return allowlistRemove(params.slice(1).join(' '));
  if (action === 'allowlist') return listAllowlist();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco approvals [list|pending|approve|reject|set-policy|set|add|get|allowlist]\n'));
  process.exit(1);
}

function listApprovals() {
  const config = getConfig();
  const policy = config.execApprovalPolicy || 'auto';
  const queue = loadQueue();

  console.log('\n' + tui.styled('  🛡️  Approvals', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Mini info card
  const cardW = 48;
  const pendingCount = queue.filter(r => r.status === 'pending').length;
  console.log(tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Policy  ') + tui.styled(policy.padEnd(40), { color: tui.PALETTE.text, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Queue   ') + tui.styled((pendingCount + ' pending').padEnd(40), { color: pendingCount > 0 ? tui.PALETTE.warning : tui.PALETTE.success, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));

  const rows = queue.map(r => ({
    id: r.id, source: r.source || 'cli', text: r.text, status: r.status,
  }));

  console.log('\n' + tui.table(rows, [
    { key: 'id', label: 'ID', minWidth: 14, render: r => tui.C.muted(r.id) },
    { key: 'source', label: 'Kaynak', minWidth: 12, render: r => tui.C.text(r.source) },
    { key: 'text', label: 'Komut', minWidth: 25, render: r => tui.C.muted(r.text) },
    {
      key: 'status', label: 'Durum', minWidth: 12,
      render: r => r.status === 'pending'
        ? tui.styled(' ⏳ Bekliyor ', { bg: tui.PALETTE.warning, color: '#000', bold: true })
        : r.status === 'approved'
        ? tui.styled('  ✓ Onaylı ', { bg: tui.PALETTE.success, color: '#000', bold: true })
        : tui.styled('  ✗ Reddedildi ', { bg: tui.PALETTE.danger, color: '#000', bold: true })
    },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function listPending() {
  const queue = loadQueue().filter(r => r.status === 'pending');
  if (queue.length === 0) {
    console.log('\n' + tui.C.muted('  No pending approvals.') + '\n');
    return;
  }

  const rows = queue.map(r => ({
    id: r.id, source: r.source || 'cli', text: r.text, status: r.status,
  }));
  console.log('\n' + tui.styled('  ⏳ Bekleyen Onaylar (' + rows.length + ')', { color: tui.PALETTE.warning, bold: true }));
  console.log('\n' + tui.table(rows, [
    { key: 'id', label: 'ID', minWidth: 14, render: r => tui.C.muted(r.id) },
    { key: 'source', label: 'Kaynak', minWidth: 12, render: r => tui.C.text(r.source) },
    { key: 'text', label: 'Komut', minWidth: 25, render: r => tui.C.muted(r.text) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function addReq(text) {
  if (!text) {
    console.log(chalk.red('\n  ❌ Request text gerekli\n'));
    process.exit(1);
  }
  const queue = loadQueue();
  const r = { id: genId(), text, status: 'pending', source: 'cli', createdAt: new Date().toISOString(), resolvedAt: null };
  queue.push(r);
  saveQueue(queue);
  console.log(chalk.yellow(`\n  ⏳ Onay beklemede: ${r.id}\n`));
  console.log(`  ${chalk.white(text)}`);
  console.log(chalk.gray(`  Onaylamak için: natureco approvals approve ${r.id}`));
  console.log();
}

function approveReq(id) {
  const queue = loadQueue();
  if (id) {
    const r = queue.find(x => x.id === id);
    if (!r) { console.log(chalk.red(`\n  ❌ Request bulunamadı: ${id}\n`)); process.exit(1); }
    if (r.status !== 'pending') { console.log(chalk.yellow(`\n  ⚠️  "${id}" zaten ${r.status}\n`)); return; }
    r.status = 'approved';
    r.resolvedAt = new Date().toISOString();
    saveQueue(queue);
    F.success(`Approved: ${r.text}`);
    return;
  }
  const pending = queue.filter(r => r.status === 'pending');
  if (pending.length === 0) { console.log(chalk.gray('\n  Bekleyen onay yok\n')); return; }
  for (const r of pending) { r.status = 'approved'; r.resolvedAt = new Date().toISOString(); }
  saveQueue(queue);
  F.success(`${pending.length} requests approved`);
}

function rejectReq(id) {
  const queue = loadQueue();
  if (id) {
    const r = queue.find(x => x.id === id);
    if (!r) { console.log(chalk.red(`\n  ❌ Request bulunamadı: ${id}\n`)); process.exit(1); }
    if (r.status !== 'pending') { console.log(chalk.yellow(`\n  ⚠️  "${id}" zaten ${r.status}\n`)); return; }
    r.status = 'rejected';
    r.resolvedAt = new Date().toISOString();
    saveQueue(queue);
    F.error(`Rejected: ${r.text}`);
    return;
  }
  const pending = queue.filter(r => r.status === 'pending');
  if (pending.length === 0) { console.log(chalk.gray('\n  Bekleyen onay yok\n')); return; }
  for (const r of pending) { r.status = 'rejected'; r.resolvedAt = new Date().toISOString(); }
  saveQueue(queue);
  F.error(`${pending.length} requests rejected`);
}

function setPolicy(policy) {
  if (!policy || !['auto', 'always-ask', 'trusted'].includes(policy)) {
    console.log(chalk.red('\n  ❌ Policy must be: auto, always-ask, or trusted\n'));
    process.exit(1);
  }
  const config = getConfig();
  config.execApprovalPolicy = policy;
  saveConfig(config);
  console.log(chalk.green(`\n  ✅ Approval policy: ${policy}\n`));
}

function getReq(id) {
  if (!id) {
    console.log(chalk.red('\n  ❌ Request ID gerekli\n'));
    process.exit(1);
  }
  const queue = loadQueue();
  const r = queue.find(x => x.id === id);
  if (!r) {
    console.log(chalk.red(`\n  ❌ Request bulunamadı: ${id}\n`));
    process.exit(1);
  }
  F.kv('ID', r.id);
  F.kv('Text', r.text);
  F.kv('Status', r.status);
  F.kv('Source', r.source || 'cli');
  F.kv('Created', r.createdAt ? new Date(r.createdAt).toLocaleString() : '-');
  F.kv('Resolved', r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : '-');
}

function listAllowlist() {
  const patterns = loadAllowlist();
  if (patterns.length === 0) {
    F.info('No patterns in allowlist.');
    return;
  }
  F.list(patterns);
}

function allowlistAdd(pattern) {
  if (!pattern) {
    console.log(chalk.red('\n  ❌ Pattern gerekli\n'));
    process.exit(1);
  }
  const patterns = loadAllowlist();
  if (patterns.includes(pattern)) {
    F.warning(`Pattern already in allowlist: ${pattern}`);
    return;
  }
  patterns.push(pattern);
  saveAllowlist(patterns);
  F.success(`Added to allowlist: ${pattern}`);
}

function allowlistRemove(pattern) {
  if (!pattern) {
    console.log(chalk.red('\n  ❌ Pattern gerekli\n'));
    process.exit(1);
  }
  let patterns = loadAllowlist();
  const initial = patterns.length;
  patterns = patterns.filter(p => p !== pattern);
  if (patterns.length === initial) {
    F.warning(`Pattern not found in allowlist: ${pattern}`);
    return;
  }
  saveAllowlist(patterns);
  F.success(`Removed from allowlist: ${pattern}`);
}

module.exports = approvals;
