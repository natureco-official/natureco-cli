/**
 * natureco audit — Audit log görüntüleyici ve yönetimi (Phase 2)
 *
 * Kullanım:
 *   natureco audit               Bugünkü log'ları göster (son 50)
 *   natureco audit today         Bugünkü tüm loglar
 *   natureco audit stats         Son 24 saat istatistik
 *   natureco audit show <date>   Belirli bir günün logları (YYYY-MM-DD)
 *   natureco audit cleanup       30 günden eski logları sil
 *   natureco audit tail          Canlı log akışı
 *   natureco audit search <q>    Action veya data içinde ara
 */

const chalk = require('chalk');
const tui = require('../utils/tui');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const audit = require('../utils/audit');

const SEVERITY_COLORS = {
  command: chalk.cyan,
  approval: chalk.yellow,
  tool: chalk.magenta,
  auth: chalk.green,
  secret: chalk.red.bold,
  config: chalk.blue,
  cron: chalk.gray,
  skill: chalk.green,
  error: chalk.red,
  info: chalk.white,
};

function colorizeAction(action) {
  if (!action) return chalk.gray('?');
  const prefix = action.split('.')[0];
  const colorFn = SEVERITY_COLORS[prefix] || chalk.white;
  return colorFn(action);
}

function formatEntry(entry) {
  const ts = entry.ts ? entry.ts.slice(11, 19) : '--:--:--';
  const action = colorizeAction(entry.action);
  // data içinden en anlamlı alanı çıkar
  const data = { ...entry };
  delete data.ts; delete data.pid; delete data.ppid; delete data.user;
  delete data.cwd; delete data.argv; delete data.action;
  const dataStr = Object.keys(data).length > 0
    ? ' ' + chalk.gray(JSON.stringify(data).slice(0, 100))
    : '';
  return `${chalk.gray(ts)}  ${action}${dataStr}`;
}

function showEntries(entries, limit = 50) {
  if (entries.length === 0) {
    console.log(tui.C.muted('\n  Kayıt yok.\n'));
    return;
  }
  const slice = entries.slice(-limit);
  console.log(tui.styled(`\n  📋 ${entries.length} kayıt${limit < entries.length ? ` (son ${limit})` : ''}`, { color: tui.PALETTE.primary, bold: true }));

  // Yeni TUI tablo
  const rows = slice.map(e => ({
    ts: e.ts ? e.ts.slice(11, 19) : '--:--:--',
    action: e.action,
    data: Object.keys(e).filter(k => !['ts', 'pid', 'ppid', 'user', 'cwd', 'argv', 'action'].includes(k)).length > 0
      ? JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['ts', 'pid', 'ppid', 'user', 'cwd', 'argv', 'action'].includes(k)))).slice(0, 80)
      : '',
  }));

  console.log('\n' + tui.table(rows, [
    { key: 'ts', label: 'Saat', minWidth: 10, render: r => tui.C.muted(r.ts) },
    { key: 'action', label: 'Action', minWidth: 22, render: r => colorizeAction(r.action) },
    { key: 'data', label: 'Veri', minWidth: 30, render: r => tui.C.dim(r.data) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function audit_cmd(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'today') {
    const today = new Date().toISOString().slice(0, 10);
    const entries = audit.readLog(today);
    showEntries(entries);
    return;
  }

  if (action === 'stats') {
    const stats = audit.stats24h();
    console.log('\n' + tui.styled('  📊 Son 24 Saat Audit İstatistiği', { color: tui.PALETTE.primary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n  ' + tui.C.muted('Dönem: ') + tui.C.text(stats.period));
    console.log('  ' + tui.C.muted('Toplam kayıt: ') + tui.styled(String(stats.total), { color: tui.PALETTE.primary, bold: true }));
    console.log('');

    // TUI tablo ile
    const rows = Object.entries(stats.byAction)
      .sort((a, b) => b[1] - a[1])
      .map(([act, count]) => {
        const max = Math.max(...Object.values(stats.byAction));
        const bar = tui.progressBar(count / max, 1, { width: 20, showPercent: false });
        return { action: act, count: String(count), bar };
      });

    if (rows.length > 0) {
      console.log(tui.table(rows, [
        { key: 'action', label: 'Action', minWidth: 22, render: r => colorizeAction(r.action) },
        { key: 'count', label: 'Sayı', minWidth: 6, render: r => tui.styled(r.count, { color: tui.PALETTE.secondary, bold: true }) },
        { key: 'bar', label: 'Dağılım', minWidth: 22, render: r => tui.styled(r.bar, { color: tui.PALETTE.primary }) },
      ], { borderStyle: 'round', zebra: true }));
    }
    console.log('');
    return;
  }

  if (action === 'show') {
    const date = params[0] || new Date().toISOString().slice(0, 10);
    const entries = audit.readLog(date);
    if (entries.length === 0) {
      console.log(chalk.yellow(`\n  ⚠️  ${date} için kayıt yok.\n`));
      return;
    }
    showEntries(entries, 9999);
    return;
  }

  if (action === 'cleanup') {
    const removed = audit.cleanup();
    console.log(chalk.green(`\n  ✓ ${removed} eski log dosyası temizlendi (30 gün+).\n`));
    return;
  }

  if (action === 'tail') {
    console.log(chalk.cyan('\n  📡 Canlı audit log (Ctrl+C ile çık)...\n'));
    let lastSize = 0;
    const todayFile = audit.listLogFiles()[0];
    const interval = setInterval(() => {
      const current = audit.listLogFiles()[0];
      if (current !== todayFile) {
        console.log(chalk.gray(`\n  ── yeni gün: ${current} ──`));
      }
      const file = path.join(audit.AUDIT_DIR, audit.listLogFiles()[0]);
      try {
        const stat = fs.statSync(file);
        if (stat.size > lastSize) {
          // Son eklenen satırları oku
          const fd = fs.openSync(file, 'r');
          const buf = Buffer.alloc(stat.size - lastSize);
          fs.readSync(fd, buf, 0, buf.length, lastSize);
          fs.closeSync(fd);
          const lines = buf.toString('utf8').trim().split('\n');
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              console.log('  ' + formatEntry(entry));
            } catch {}
          }
          lastSize = stat.size;
        }
      } catch {}
    }, 1000);
    process.on('SIGINT', () => { clearInterval(interval); process.exit(0); });
    return;
  }

  if (action === 'search') {
    const query = params.join(' ').toLowerCase();
    if (!query) {
      console.log(chalk.red('\n  ❌ Arama terimi gerekli: natureco audit search <query>\n'));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const all = [...audit.readLog(today), ...audit.readLog(yesterday)];
    const matches = all.filter(e =>
      (e.action && e.action.toLowerCase().includes(query)) ||
      JSON.stringify(e).toLowerCase().includes(query)
    );
    showEntries(matches, 200);
    return;
  }

  if (action === 'files') {
    const files = audit.listLogFiles();
    console.log(chalk.bold('\n  📁 Audit log dosyaları:\n'));
    for (const f of files) {
      const stat = fs.statSync(path.join(audit.AUDIT_DIR, f));
      const size = (stat.size / 1024).toFixed(1);
      console.log(`  ${chalk.cyan(f.padEnd(40))} ${chalk.gray(size + ' KB')}`);
    }
    console.log('');
    return;
  }

  // Yardım
  console.log(chalk.yellow('\n  Kullanım:'));
  console.log(chalk.gray('    natureco audit               Bugünkü logları göster'));
  console.log(chalk.gray('    natureco audit today         Bugünkü tüm loglar'));
  console.log(chalk.gray('    natureco audit stats         24 saat istatistik'));
  console.log(chalk.gray('    natureco audit show <date>   Belirli gün (YYYY-MM-DD)'));
  console.log(chalk.gray('    natureco audit search <q>    Log ara'));
  console.log(chalk.gray('    natureco audit files         Dosya listesi'));
  console.log(chalk.gray('    natureco audit cleanup       30 günden eski logları sil'));
  console.log(chalk.gray('    natureco audit tail          Canlı akış'));
  console.log('');
}

module.exports = audit_cmd;
