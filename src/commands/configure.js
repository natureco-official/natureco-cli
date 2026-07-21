const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { writePrivateFile } = require('../utils/config');

const BASE_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveConfig(data) {
  writePrivateFile(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function configure(params) {
  try {
    const [action] = params || [];

    if (!action) return cmdMenu();
    if (action === 'gateway') return await cmdGateway();
    if (action === 'auth') return await cmdAuth();
    if (action === 'channels') return cmdChannels();
    if (action === 'plugins') return cmdPlugins();
    if (action === 'skills') return cmdSkills();

    console.log(chalk.red(`\n  Unknown configure action: ${action}\n`));
    console.log(chalk.gray('  Usage: natureco configure [gateway|auth|channels|plugins|skills]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Configure error: ${err.message}\n`));
  }
}

function cmdMenu() {
  console.log(chalk.cyan('\n  Configure\n'));
  console.log(chalk.gray('  Run with an action:'));
  console.log(chalk.gray('    natureco configure gateway   Update gateway config'));
  console.log(chalk.gray('    natureco configure auth      Update provider keys'));
  console.log(chalk.gray('    natureco configure channels   Re-run channels setup'));
  console.log(chalk.gray('    natureco configure plugins    Re-run plugin setup'));
  console.log(chalk.gray('    natureco configure skills     Re-run skills setup\n'));
}

async function cmdGateway() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Gateway Configuration\n'));
  console.log(chalk.gray('  Current: ') + chalk.white(cfg.gatewayUrl || 'not set'));

  const url = await rlQuestion(`  Gateway URL (${cfg.gatewayUrl || 'ws://localhost:3848'}): `);
  const port = await rlQuestion(`  Port (${cfg.gatewayPort || 3848}): `);

  cfg.gatewayUrl = url || cfg.gatewayUrl || 'ws://localhost:3848';
  cfg.gatewayPort = parseInt(port) || cfg.gatewayPort || 3848;
  saveConfig(cfg);

  console.log(chalk.green(`\n  Gateway updated: ${cfg.gatewayUrl}:${cfg.gatewayPort}\n`));
}

async function cmdAuth() {
  const cfg = getConfig();
  console.log(chalk.cyan('\n  Auth Configuration\n'));
  console.log(chalk.gray('  Current provider key: ') + chalk.white(cfg.providerApiKey ? '(set)' : '(not set)'));

  const key = await rlQuestion('  Provider API Key (leave blank to keep current): ');
  if (key) {
    cfg.providerApiKey = key;
    saveConfig(cfg);
    console.log(chalk.green('\n  API key updated.\n'));
  } else {
    console.log(chalk.gray('\n  No changes made.\n'));
  }
}

function cmdChannels() {
  console.log(chalk.cyan('\n  Channels Setup\n'));
  console.log(chalk.gray('  To connect a channel:'));
  const channels = ['telegram', 'whatsapp', 'discord', 'slack', 'signal', 'irc', 'mattermost', 'imessage'];
  for (const ch of channels) {
    console.log(chalk.gray('    natureco ' + ch + ' connect'));
  }
  console.log('');
}

function cmdPlugins() {
  console.log(chalk.cyan('\n  Plugin Setup\n'));
  console.log(chalk.gray('  To manage plugins:'));
  console.log(chalk.cyan('    natureco plugins list'));
  console.log(chalk.cyan('    natureco plugins add <url>\n'));
}

function cmdSkills() {
  console.log(chalk.cyan('\n  Skills Setup\n'));
  console.log(chalk.gray('  To manage skills:'));
  console.log(chalk.cyan('    natureco skills list'));
  console.log(chalk.cyan('    natureco skills add <name>\n'));
}

module.exports = configure;
