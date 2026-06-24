const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const POLICY_FILE = path.join(os.homedir(), '.natureco', 'exec-policy.json');

const PRESETS = {
  strict: { allowCommands: false, allowScripts: false, timeout: 10000, sandbox: 'strict', approvals: 'all' },
  permissive: { allowCommands: true, allowScripts: true, timeout: 60000, sandbox: 'none', approvals: 'none' },
  default: { allowCommands: true, allowScripts: false, timeout: 30000, sandbox: 'isolated', approvals: 'write' },
};

function loadPolicy() {
  if (!fs.existsSync(POLICY_FILE)) return { ...PRESETS.default };
  try { return JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')); }
  catch { return { ...PRESETS.default }; }
}

function savePolicy(policy) {
  const dir = path.dirname(POLICY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2), 'utf8');
}

function execPolicy(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'show') return cmdShow();
  if (action === 'preset') return cmdPreset(params[0]);
  if (action === 'set') return cmdSet(params[0], params.slice(1).join(' '));

  console.log(chalk.red(`\n  Unknown exec-policy action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco exec-policy <action> [params]'));
  console.log(chalk.gray('  Actions: show, preset <name>, set <key> <value>\n'));
  process.exit(1);
}

function cmdShow() {
  const policy = loadPolicy();

  console.log(chalk.cyan('\n  Execution Policy\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  for (const [key, val] of Object.entries(policy)) {
    const display = typeof val === 'boolean' ? (val ? chalk.green('yes') : chalk.red('no')) : chalk.white(val);
    console.log(`  ${chalk.white(key)}: ${display}`);
  }
  console.log('');
  console.log(chalk.gray('  Presets: strict, permissive, default\n'));
}

function cmdPreset(name) {
  if (!name || !PRESETS[name]) {
    console.log(chalk.red(`\n  Unknown preset: ${name}\n`));
    console.log(chalk.gray('  Available presets: strict, permissive, default\n'));
    process.exit(1);
  }

  savePolicy({ ...PRESETS[name] });
  console.log(chalk.green(`\n  Policy set to "${name}" preset.\n`));
}

function cmdSet(key, value) {
  if (!key || value === undefined) {
    console.log(chalk.red('\n  Usage: natureco exec-policy set <key> <value>\n'));
    process.exit(1);
  }

  const policy = loadPolicy();

  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (!isNaN(value)) value = Number(value);

  policy[key] = value;
  savePolicy(policy);
  console.log(chalk.green(`\n  Policy "${key}" set to ${JSON.stringify(value)}.\n`));
}

module.exports = execPolicy;
