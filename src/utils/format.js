const chalk = require('chalk');
const tui = require('./tui');
tui.init();

const W = () => Math.min(process.stdout.columns || 100, 100);

// Yeni TUI-powered header
function header(text, options = {}) {
  const { icon = '◈', color = tui.PALETTE.primary } = options;
  console.log('\n' + tui.styled(`  ${icon}  ${text}`, { color, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(Math.min(W() - 4, 60)), { color: tui.PALETTE.border }));
}

function section(text) {
  const w = W();
  console.log('');
  console.log(chalk.dim('▔').repeat(Math.min(w - 4, 48)));
  console.log(chalk.bold.cyan('  ' + text));
}

function divider() {
  const w = W();
  console.log(chalk.dim('─').repeat(Math.min(w - 4, 48)));
}

function label(key, value, options = {}) {
  const { indent = 2, keyWidth = 14, valueColor = 'white' } = options;
  const pad = ' '.repeat(indent);
  const coloredKey = chalk.dim(key.padEnd(keyWidth));
  const coloredValue = chalk[valueColor] ? chalk[valueColor](value) : chalk.white(value);
  console.log(pad + coloredKey + coloredValue);
}

function kv(key, value) {
  if (value === undefined || value === null) value = chalk.dim('—');
  const keyStr = chalk.dim(key.padEnd(14));
  console.log('  ' + keyStr + chalk.white(value));
}

function badge(text, color = 'cyan') {
  const c = chalk[color] || chalk.cyan;
  return c.bold(' ' + text + ' ');
}

function cmd(text) {
  return chalk.cyan(text);
}

function flag(text) {
  return chalk.yellow(text);
}

function success(text) {
  console.log(chalk.green('  ✓ ' + text));
}

function error(text) {
  console.log(chalk.red('  ✗ ' + text));
}

function warning(text) {
  console.log(chalk.yellow('  ⚠ ' + text));
}

function info(text) {
  console.log(chalk.blue('  ℹ ' + text));
}

function list(items, options = {}) {
  const { indent = 2, bullet = '•' } = options;
  const pad = ' '.repeat(indent);
  for (const item of items) {
    if (typeof item === 'string') {
      console.log(pad + chalk.dim(bullet + ' ') + chalk.white(item));
    } else if (item.label && item.value) {
      console.log(pad + chalk.dim(bullet + ' ') + chalk.white(item.label + ': ') + chalk.dim(item.value));
    } else if (item.label) {
      console.log(pad + chalk.dim(bullet + ' ') + chalk.white(item.label));
      if (item.desc) console.log(pad + '  ' + chalk.dim(item.desc));
    }
  }
}

function table(headers, rows, options = {}) {
  const { indent = 2, headerColor = 'bold.cyan' } = options;
  const pad = ' '.repeat(indent);

  if (rows.length === 0) {
    console.log(pad + chalk.dim('(empty)'));
    return;
  }

  const colCount = headers.length;
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, String(row[i] || '').length), 0);
    return Math.max(h.length, maxData) + 2;
  });

  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + colCount - 1;
  if (totalWidth > W() - indent) {
    const ratio = (W() - indent - colCount + 1) / (totalWidth - colCount + 1);
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.max(3, Math.floor((colWidths[i] - 2) * ratio) + 2);
    }
  }

  const hdr = headers.map((h, i) => {
    const w = colWidths[i];
    const text = h.length > w - 1 ? h.slice(0, w - 2) + '…' : h.padEnd(w);
    return chalk.bold.cyan(text);
  }).join(' ');
  console.log(pad + chalk.dim('┌' + '─'.repeat(totalWidth) + '┐'));
  console.log(pad + chalk.dim('│') + hdr + chalk.dim('│'));
  console.log(pad + chalk.dim('├' + '─'.repeat(totalWidth) + '┤'));

  for (const row of rows) {
    const cells = row.map((cell, i) => {
      const w = colWidths[i];
      const text = String(cell || '');
      return (text.length > w - 1 ? text.slice(0, w - 2) + '…' : text.padEnd(w));
    }).join(' ');
    console.log(pad + chalk.dim('│') + cells + chalk.dim('│'));
  }

  console.log(pad + chalk.dim('└' + '─'.repeat(totalWidth) + '┘'));
}

function dot(enabled, label) {
  const d = enabled ? chalk.green('●') : chalk.dim('○');
  console.log('  ' + d + ' ' + chalk.white(label));
}

function meta(text) {
  console.log(chalk.dim('  ' + text));
}

function json(obj) {
  console.log(chalk.dim('  ') + chalk.white(JSON.stringify(obj, null, 2).replace(/\n/g, '\n  ')));
}

module.exports = { header, section, divider, label, kv, badge, cmd, flag, success, error, warning, info, list, table, dot, meta, json };
