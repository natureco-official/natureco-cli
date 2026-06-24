const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOKS_FILE = path.join(os.homedir(), '.natureco', 'hooks.json');

function loadHooks() {
  if (!fs.existsSync(HOOKS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf8')); }
  catch { return []; }
}

function saveHooks(hooks) {
  const dir = path.dirname(HOOKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HOOKS_FILE, JSON.stringify(hooks, null, 2), 'utf8');
}

function hooks(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return cmdList();
  if (action === 'info') return cmdInfo(params[0]);
  if (action === 'check') return cmdCheck(params[0]);
  if (action === 'enable') return cmdEnable(params[0]);
  if (action === 'disable') return cmdDisable(params[0]);
  if (action === 'install') return cmdInstall(params[0]);
  if (action === 'update') return cmdUpdate(params[0]);

  console.log(chalk.red(`\n  Unknown hooks action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco hooks <action> [params]'));
  console.log(chalk.gray('  Actions: list, info <name>, check <name>, enable <name>, disable <name>, install <url>, update <name>\n'));
  process.exit(1);
}

function cmdList() {
  const hooks = loadHooks();

  console.log(chalk.cyan(`\n  Hooks (${hooks.length})\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (hooks.length === 0) {
    console.log(chalk.gray('  No hooks installed.\n'));
    return;
  }

  for (const h of hooks) {
    const status = h.disabled ? chalk.red('disabled') : chalk.green('enabled');
    console.log(`  ${chalk.white(h.name)} ${chalk.gray(`— ${status}`)}`);
    if (h.type) console.log(chalk.gray(`    Type: ${h.type}`));
    if (h.url) console.log(chalk.gray(`    URL:  ${h.url}`));
  }
  console.log('');
}

function cmdInfo(name) {
  if (!name) { console.log(chalk.red('\n  Usage: natureco hooks info <name>\n')); process.exit(1); }

  const hooks = loadHooks();
  const h = hooks.find(x => x.name === name);

  if (!h) { console.log(chalk.yellow(`\n  Hook "${name}" not found.\n`)); return; }

  console.log(chalk.cyan(`\n  Hook: ${h.name}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  for (const [key, val] of Object.entries(h)) {
    console.log(`  ${chalk.white(key)}: ${chalk.white(typeof val === 'object' ? JSON.stringify(val) : val)}`);
  }
  console.log('');
}

function cmdCheck(name) {
  if (!name) { console.log(chalk.red('\n  Usage: natureco hooks check <name>\n')); process.exit(1); }

  const hooks = loadHooks();
  const h = hooks.find(x => x.name === name);

  if (!h) { console.log(chalk.yellow(`\n  Hook "${name}" not found.\n`)); return; }

  const issues = [];
  if (!h.type) issues.push('Missing type');
  if (!h.run) issues.push('Missing run script/command');
  if (h.disabled) issues.push('Hook is disabled');

  if (issues.length === 0) {
    console.log(chalk.green(`\n  Hook "${name}" is valid.\n`));
  } else {
    console.log(chalk.yellow(`\n  Hook "${name}" has ${issues.length} issue(s):\n`));
    for (const issue of issues) console.log(chalk.yellow(`  - ${issue}`));
    console.log('');
  }
}

function cmdEnable(name) {
  if (!name) { console.log(chalk.red('\n  Usage: natureco hooks enable <name>\n')); process.exit(1); }

  const hooks = loadHooks();
  const h = hooks.find(x => x.name === name);
  if (!h) { console.log(chalk.yellow(`\n  Hook "${name}" not found.\n`)); return; }

  h.disabled = false;
  saveHooks(hooks);
  console.log(chalk.green(`\n  Hook "${name}" enabled.\n`));
}

function cmdDisable(name) {
  if (!name) { console.log(chalk.red('\n  Usage: natureco hooks disable <name>\n')); process.exit(1); }

  const hooks = loadHooks();
  const h = hooks.find(x => x.name === name);
  if (!h) { console.log(chalk.yellow(`\n  Hook "${name}" not found.\n`)); return; }

  h.disabled = true;
  saveHooks(hooks);
  console.log(chalk.gray(`\n  Hook "${name}" disabled.\n`));
}

function cmdInstall(url) {
  if (!url) { console.log(chalk.red('\n  Usage: natureco hooks install <url>\n')); process.exit(1); }

  const hooks = loadHooks();
  const name = path.basename(url, path.extname(url));
  hooks.push({ name, url, type: 'custom', disabled: false, installedAt: new Date().toISOString() });
  saveHooks(hooks);
  console.log(chalk.green(`\n  Hook "${name}" installed from ${url}.\n`));
}

function cmdUpdate(name) {
  if (!name) { console.log(chalk.red('\n  Usage: natureco hooks update <name>\n')); process.exit(1); }

  const hooks = loadHooks();
  const h = hooks.find(x => x.name === name);
  if (!h) { console.log(chalk.yellow(`\n  Hook "${name}" not found.\n`)); return; }

  h.updatedAt = new Date().toISOString();
  saveHooks(hooks);
  console.log(chalk.green(`\n  Hook "${name}" updated.\n`));
}

module.exports = hooks;
