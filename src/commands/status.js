const chalk = require('chalk');
const F = require('../utils/format');
const tui = require('../utils/tui');
const fs = require('fs');
const path = require('path');
const os = require('os');

function tryRequire(mod) {
  try { return require(mod); }
  catch { return null; }
}

function status(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'run') return cmdRun();
  if (action === 'simple') return cmdSimple();
  if (action === 'usage') return cmdUsage();

  F.error(`Unknown status action: ${action}`);
  F.meta('Usage: natureco status <action>');
  F.meta('Actions: run, simple, usage');
  process.exit(1);
}

function cmdRun() {
  let version = '—';
  try { version = require('../../package.json').version; } catch {}

  const config = tryRequire('../utils/config');
  const cfg = config ? config.getConfig() : {};

  // Phase 9 TUI: round border + iki kolon
  const cardW = 56;
  const lines = [];
  lines.push(tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Version          ') + tui.styled(`v${version}`.padEnd(36), { color: tui.PALETTE.text, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Platform         ') + tui.styled(`${process.platform} ${os.release()}`.padEnd(36), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));

  const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
  const gatewayRunning = fs.existsSync(pidFile);
  const gatewayStatus = gatewayRunning
    ? tui.styled('  ✓ Çalışıyor ', { bg: tui.PALETTE.success, color: '#000', bold: true })
    : tui.styled('  ✗ Durmuş   ', { bg: tui.PALETTE.muted, color: '#000', bold: true });
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Gateway          ') + gatewayStatus + ' '.repeat(23) + tui.styled(' │', { color: tui.PALETTE.border }));

  if (cfg.providerUrl) {
    lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Provider         ') + tui.styled(cfg.providerUrl.padEnd(36), { color: tui.PALETTE.primary, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  }
  if (cfg.botName) {
    lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Bot              ') + tui.styled((cfg.botName || '—').padEnd(36), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
  }

  const nodesFile = path.join(os.homedir(), '.natureco', 'nodes.json');
  let nodeCount = 0;
  if (fs.existsSync(nodesFile)) {
    try { nodeCount = Object.keys(JSON.parse(fs.readFileSync(nodesFile, 'utf8'))).length; } catch {}
  }
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Nodes            ') + tui.styled(String(nodeCount).padEnd(36), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));

  const channelCount = [cfg.telegramToken, cfg.whatsappConnected, cfg.discordToken, cfg.slackToken].filter(Boolean).length;
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Channels         ') + tui.styled(String(channelCount).padEnd(36), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));

  // Skill + araç görünürlüğü: "skill'ler görünmüyor" raporlarını tek bakışta
  // teşhis edilir yapar (yerleşikler npm paketinin içinde yaşar, ~/.natureco'da değil)
  let skillInfo = '—';
  try {
    const { getSkills } = tryRequire('../utils/skills') || {};
    if (getSkills) {
      const all = getSkills();
      const builtin = all.filter(s => s.source === 'builtin').length;
      const user = all.length - builtin;
      skillInfo = `${all.length} (${builtin} yerleşik` + (user > 0 ? ` + ${user} kullanıcı` : '') + ')';
    }
  } catch {}
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Skills           ') + tui.styled(skillInfo.padEnd(36), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));

  let toolCount = '—';
  try {
    const toolsDir = path.join(__dirname, '..', 'tools');
    toolCount = String(fs.readdirSync(toolsDir).filter(f => f.endsWith('.js')).length);
  } catch {}
  lines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Tools            ') + tui.styled(String(toolCount).padEnd(36), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));

  lines.push(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));
  console.log('\n' + tui.styled('  🩺 Sistem Durumu', { color: tui.PALETTE.primary, bold: true }));
  console.log(lines.join('\n'));
  console.log('');
}

function cmdSimple() {
  let version = '—';
  try { version = require('../../package.json').version; } catch {}

  const config = tryRequire('../utils/config');
  const cfg = config ? config.getConfig() : {};
  const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
  const gatewayRunning = fs.existsSync(pidFile);

  F.dot(gatewayRunning, 'Gateway');

  const parts = [chalk.gray(`v${version}`)];
  if (cfg.providerUrl) {
    const host = cfg.providerUrl.replace('https://', '').split('/')[0];
    parts.push(chalk.white(host));
  }

  console.log(chalk.cyan.bold('  NatureCo ') + parts.join(chalk.gray(' · ')));
}

function cmdUsage() {
  const config = tryRequire('../utils/config');
  const cfg = config ? config.getConfig() : {};

  if (!cfg.providerUrl) {
    console.log('\n' + tui.C.muted('  Provider tanımlı değil.'));
    return;
  }

  const usage = cfg.usage || {};
  const rows = [
    { key: 'provider', label: 'Provider', value: cfg.providerUrl },
    { key: 'model', label: 'Model', value: cfg.providerModel || '—' },
    { key: 'tokens', label: 'Tokens', value: String(usage.totalTokens || '—') },
    { key: 'requests', label: 'Requests', value: String(usage.totalRequests || '—') },
    { key: 'session', label: 'Session', value: String(usage.sessionTokens || '—') },
  ];

  console.log('\n' + tui.styled('  📊 Provider Kullanımı', { color: tui.PALETTE.primary, bold: true }));
  console.log('\n' + tui.table(rows, [
    { key: 'key', label: 'Anahtar', minWidth: 12, render: r => tui.C.muted(r.key) },
    { key: 'value', label: 'Değer', minWidth: 30, render: r => tui.C.text(r.value) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

module.exports = status;
