const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const NODES_FILE = path.join(os.homedir(), '.natureco', 'nodes.json');

function loadNodes() {
  if (!fs.existsSync(NODES_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(NODES_FILE, 'utf8')); }
  catch { return {}; }
}

function saveNodes(nodes) {
  const dir = path.dirname(NODES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2), 'utf8');
}

function node(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return cmdStatus(params[0]);
  if (action === 'run') return cmdRun(params[0], params.slice(1));
  if (action === 'install') return cmdInstall();
  if (action === 'uninstall') return cmdUninstall(params[0]);
  if (action === 'stop') return cmdStop(params[0]);
  if (action === 'restart') return cmdRestart(params[0]);

  console.log(chalk.red(`\n  Unknown node action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco node <action> [params]'));
  console.log(chalk.gray('  Actions: run <id>, status <id>, install, uninstall, stop <id>, restart <id>\n'));
  process.exit(1);
}

function cmdRun(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco node run <id>\n')); process.exit(1); }
  const nodes = loadNodes();
  const n = nodes[id];
  if (!n) { console.log(chalk.yellow(`\n  Node "${id}" not found.\n`)); return; }
  return notImplemented('run');
}

function cmdStatus(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco node status <id>\n')); process.exit(1); }
  const nodes = loadNodes();
  const n = nodes[id];

  console.log(chalk.cyan(`\n  Node: ${id || '(all)'}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (!n) {
    console.log(chalk.yellow(`  Node "${id}" not found.\n`));
    return;
  }

  console.log(`  ${chalk.white('ID:')}       ${chalk.cyan(n.id || id)}`);
  console.log(`  ${chalk.white('Host:')}     ${chalk.white(n.host || n.hostname || '—')}`);
  console.log(`  ${chalk.white('Port:')}     ${chalk.white(n.port || '—')}`);
  console.log(`  ${chalk.white('Status:')}   ${chalk.yellow('unknown (no transport)')}`);
  console.log(`  ${chalk.white('Version:')}  ${chalk.gray(n.version || '—')}`);
  console.log('');
}

function cmdInstall() {
  return notImplemented('install');
}

function cmdUninstall(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco node uninstall <id>\n')); process.exit(1); }
  const nodes = loadNodes();
  if (!nodes[id]) { console.log(chalk.yellow(`\n  Node "${id}" not found.\n`)); return; }
  delete nodes[id];
  saveNodes(nodes);
  console.log(chalk.gray(`\n  Node "${id}" uninstalled.\n`));
}

function cmdStop(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco node stop <id>\n')); process.exit(1); }
  const nodes = loadNodes();
  if (!nodes[id]) { console.log(chalk.yellow(`\n  Node "${id}" not found.\n`)); return; }
  return notImplemented('stop');
}

function cmdRestart(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco node restart <id>\n')); process.exit(1); }
  const nodes = loadNodes();
  if (!nodes[id]) { console.log(chalk.yellow(`\n  Node "${id}" not found.\n`)); return; }
  return notImplemented('restart');
}

function notImplemented(action) {
  const result = { success: false, error: `Node ${action} is not implemented` };
  console.log(chalk.red(`\n  ${result.error}\n`));
  return result;
}

module.exports = node;
module.exports.notImplemented = notImplemented;
