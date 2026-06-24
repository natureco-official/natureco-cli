const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

const STEPS = ['gateway', 'auth', 'workspace', 'channels', 'skills', 'health'];

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveConfig(data) {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function onboard(params) {
  try {
    const [action] = params || [];

    if (!action || action === 'status') return cmdStatus();
    if (action === 'gateway') return cmdGateway();
    if (action === 'auth') return cmdAuth();
    if (action === 'workspace') return cmdWorkspace();
    if (action === 'channels') return cmdChannels();
    if (action === 'skills') return cmdSkills();
    if (action === 'health') return cmdHealth();

    console.log(chalk.red(`\n  Unknown onboard action: ${action}\n`));
    console.log(chalk.gray('  Usage: natureco onboard [gateway|auth|workspace|channels|skills|health|status]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Onboard error: ${err.message}\n`));
  }
}

function cmdStatus() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Onboarding Status\n'));

  const status = {
    gateway: cfg.gatewayUrl ? 'done' : 'pending',
    auth: cfg.providerApiKey ? 'done' : 'pending',
    workspace: cfg.workspacePath ? 'done' : 'pending',
    channels: cfg.channels ? 'done' : 'pending',
    skills: cfg.skills && cfg.skills.list && cfg.skills.list.length > 0 ? 'done' : 'pending',
    health: cfg.setupCompleted ? 'done' : 'pending',
  };

  for (const step of STEPS) {
    const icon = status[step] === 'done' ? chalk.green('✓') : chalk.yellow('○');
    console.log(`  ${icon} ${step}`);
  }
  console.log('');
}

function cmdGateway() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Gateway Setup\n'));
  console.log(chalk.gray('  To configure the gateway, run:'));
  console.log(chalk.cyan('    natureco configure gateway'));
  console.log(chalk.gray('  Or start the gateway:'));
  console.log(chalk.cyan('    natureco gateway start\n'));
  cfg.gatewayUrl = 'ws://localhost:3848';
  saveConfig(cfg);
  console.log(chalk.green('  Gateway step marked as done.\n'));
}

function cmdAuth() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Auth Setup\n'));
  console.log(chalk.gray('  To configure authentication, run:'));
  console.log(chalk.cyan('    natureco configure auth'));
  console.log(chalk.gray('  Or set your API key in config.\n'));
  cfg.authConfigured = true;
  saveConfig(cfg);
  console.log(chalk.green('  Auth step marked as done.\n'));
}

function cmdWorkspace() {
  const cfg = getConfig();
  const wsPath = cfg.workspacePath || path.join(os.homedir(), 'natureco-workspace');
  if (!fs.existsSync(wsPath)) fs.mkdirSync(wsPath, { recursive: true });
  cfg.workspacePath = wsPath;
  saveConfig(cfg);
  console.log(chalk.green('\n  Workspace ready at: ' + wsPath + '\n'));
}

function cmdChannels() {
  console.log(chalk.cyan('\n  Channels Setup\n'));
  console.log(chalk.gray('  Available channels:'));
  const channels = ['telegram', 'whatsapp', 'discord', 'slack', 'signal', 'irc', 'mattermost', 'imessage'];
  for (const ch of channels) {
    console.log(chalk.gray('    natureco ' + ch + ' connect'));
  }
  console.log('');
}

function cmdSkills() {
  console.log(chalk.cyan('\n  Skills Setup\n'));
  console.log(chalk.gray('  To manage skills, run:'));
  console.log(chalk.cyan('    natureco skills list'));
  console.log(chalk.cyan('    natureco skills add <name>\n'));
}

function cmdHealth() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Health Check\n'));

  const checks = [
    { label: 'Config exists', pass: fs.existsSync(CONFIG_FILE) },
    { label: 'Gateway configured', pass: !!cfg.gatewayUrl },
    { label: 'Auth configured', pass: !!cfg.providerApiKey },
    { label: 'Workspace configured', pass: !!cfg.workspacePath },
  ];

  for (const c of checks) {
    console.log(`  ${c.pass ? chalk.green('✓') : chalk.yellow('○')} ${c.label}`);
  }

  const done = checks.filter(c => c.pass).length;
  console.log(chalk.gray(`\n  ${done}/${checks.length} checks passed\n`));
}

module.exports = onboard;
