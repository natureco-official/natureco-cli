const chalk = require('chalk');
const tui = require('../utils/tui');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHECKS = {
  config: { label: 'Configuration', desc: 'Check if config file exists and is valid' },
  gateway: { label: 'Gateway', desc: 'Check if gateway is running' },
  nodes: { label: 'Nodes', desc: 'Check node connectivity' },
  disk: { label: 'Disk', desc: 'Check disk space for ~/.natureco' },
};

function health(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'run') return cmdRun();
  if (action === 'list') return cmdList();
  if (action === 'check') return cmdCheck(params[0]);

  console.log(chalk.red(`\n  Unknown health action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco health <action> [params]'));
  console.log(chalk.gray('  Actions: run, list, check <name>\n'));
  process.exit(1);
}

function cmdRun() {
  const results = [];

  results.push(runCheck('config', checkConfig));
  results.push(runCheck('gateway', checkGateway));
  results.push(runCheck('nodes', checkNodes));
  results.push(runCheck('disk', checkDisk));

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;

  console.log('\n' + tui.styled('  🩺 Health Check', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  const rows = results.map(r => ({
    label: r.label,
    status: r.status,
    message: r.message,
  }));

  console.log('\n' + tui.table(rows, [
    { key: 'label', label: 'Check', minWidth: 18, render: r => tui.C.text(r.label) },
    {
      key: 'status', label: 'Durum', minWidth: 10,
      render: r => r.status === 'pass'
        ? tui.styled('  ✓ PASS ', { bg: tui.PALETTE.success, color: '#000', bold: true })
        : r.status === 'fail'
        ? tui.styled('  ✗ FAIL ', { bg: tui.PALETTE.danger, color: '#000', bold: true })
        : tui.styled('  ⚠ WARN ', { bg: tui.PALETTE.warning, color: '#000', bold: true })
    },
    { key: 'message', label: 'Detay', minWidth: 30, render: r => tui.C.muted(r.message) },
  ], { borderStyle: 'round', zebra: true }));

  const summary = `${passed} geçti, ${warnings} uyarı, ${failed} hata`;
  if (failed > 0) {
    console.log('\n' + tui.styled('  ✗ ' + summary, { color: tui.PALETTE.danger, bold: true }));
  } else {
    console.log('\n' + tui.styled('  ✓ ' + summary, { color: tui.PALETTE.success, bold: true }));
  }
  console.log('');
}

function cmdList() {
  console.log('\n' + tui.styled('  🩺 Health Check Listesi', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  const rows = Object.entries(CHECKS).map(([key, check]) => ({
    name: key, label: check.label, desc: check.desc,
  }));
  console.log('\n' + tui.table(rows, [
    { key: 'name', label: 'İsim', minWidth: 12, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'label', label: 'Label', minWidth: 14, render: r => tui.C.text(r.label) },
    { key: 'desc', label: 'Açıklama', minWidth: 30, render: r => tui.C.muted(r.desc) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('\n  ' + tui.C.muted('Hepsi: ') + tui.C.brand('natureco health run'));
  console.log('  ' + tui.C.muted('Tek:   ') + tui.C.brand('natureco health check <name>'));
  console.log('');
}

function cmdCheck(name) {
  if (!name || !CHECKS[name]) {
    console.log(chalk.red(`\n  Unknown check: ${name}\n`));
    console.log(chalk.gray('  Available checks: ' + Object.keys(CHECKS).join(', ') + '\n'));
    process.exit(1);
  }

  const handlers = { config: checkConfig, gateway: checkGateway, nodes: checkNodes, disk: checkDisk };
  const result = runCheck(name, handlers[name]);

  if (result.status === 'pass') {
    F.success(`${result.label}: ${result.message}`);
  } else if (result.status === 'warn') {
    F.warning(`${result.label}: ${result.message}`);
  } else {
    F.error(`${result.label}: ${result.message}`);
  }
}

function runCheck(name, fn) {
  try { return { name, ...CHECKS[name], ...fn() }; }
  catch (err) { return { name, ...CHECKS[name], status: 'fail', message: err.message }; }
}

function checkConfig() {
  const configDir = path.join(os.homedir(), '.natureco');
  const configFile = path.join(configDir, 'config.json');

  if (!fs.existsSync(configDir)) return { status: 'fail', message: '~/.natureco directory does not exist' };
  if (!fs.existsSync(configFile)) return { status: 'fail', message: 'config.json not found' };

  try {
    JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return { status: 'pass', message: 'Config file exists and is valid' };
  } catch {
    return { status: 'fail', message: 'config.json is not valid JSON' };
  }
}

function checkGateway() {
  const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
  if (!fs.existsSync(pidFile)) return { status: 'warn', message: 'Gateway is not running' };

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return { status: 'pass', message: `Gateway running (PID: ${pid})` };
  } catch {
    return { status: 'warn', message: 'Gateway PID file exists but process is not running' };
  }
}

function checkNodes() {
  const nodesFile = path.join(os.homedir(), '.natureco', 'nodes.json');
  if (!fs.existsSync(nodesFile)) return { status: 'warn', message: 'No nodes configured' };

  try {
    const nodes = JSON.parse(fs.readFileSync(nodesFile, 'utf8'));
    const names = Object.keys(nodes);
    const online = names.filter(n => nodes[n].online);
    return { status: 'pass', message: `${online.length}/${names.length} nodes online` };
  } catch {
    return { status: 'fail', message: 'nodes.json is invalid' };
  }
}

function checkDisk() {
  const dir = path.join(os.homedir(), '.natureco');
  if (!fs.existsSync(dir)) return { status: 'warn', message: '~/.natureco does not exist' };

  try {
    const stat = fs.statSync(dir);
    return { status: 'pass', message: `Directory exists, last modified: ${stat.mtime.toISOString().slice(0, 10)}` };
  } catch {
    return { status: 'fail', message: 'Cannot access ~/.natureco' };
  }
}

module.exports = health;
