const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WEBHOOKS_FILE = path.join(os.homedir(), '.natureco', 'webhooks.json');

function loadWebhooks() {
  if (!fs.existsSync(WEBHOOKS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(WEBHOOKS_FILE, 'utf8')); }
  catch { return []; }
}

function saveWebhooks(webhooks) {
  const dir = path.dirname(WEBHOOKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2), 'utf8');
}

function webhooks(args) {
  const [action, subAction, ...params] = args || [];

  if (!action || action === 'list') return cmdList();
  if (action === 'gmail' && subAction === 'setup') return cmdGmailSetup();
  if (action === 'gmail' && subAction === 'run') return cmdGmailRun();

  console.log(chalk.red(`\n  Unknown webhooks action: ${action} ${subAction || ''}\n`));
  console.log(chalk.gray('  Usage: natureco webhooks <action> [params]'));
  console.log(chalk.gray('  Actions: list, gmail setup, gmail run\n'));
  process.exit(1);
}

function cmdList() {
  const webhooks = loadWebhooks();

  console.log(chalk.cyan(`\n  Webhooks (${webhooks.length})\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (webhooks.length === 0) {
    console.log(chalk.gray('  No webhooks configured.\n'));
    return;
  }

  for (const w of webhooks) {
    console.log(`  ${chalk.white(w.name || w.id || 'unnamed')}`);
    if (w.url) console.log(chalk.gray(`    URL: ${w.url}`));
    if (w.path) console.log(chalk.gray(`    Path: ${w.path}`));
    if (w.type) console.log(chalk.gray(`    Type: ${w.type}`));
  }
  console.log('');
}

function cmdGmailSetup() {
  console.log(chalk.cyan('\n  Gmail Pub/Sub Webhook Setup\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Status:')}  ${chalk.yellow('Not configured')}`);
  console.log('');
  console.log(chalk.gray('  To set up Gmail webhooks:'));
  console.log(chalk.gray('    1. Enable Gmail API in Google Cloud Console'));
  console.log(chalk.gray('    2. Create a Pub/Sub topic'));
  console.log(chalk.gray('    3. Configure the push endpoint'));
  console.log(chalk.gray('    4. Run: natureco webhooks gmail run'));
  console.log('');
}

function cmdGmailRun() {
  console.log(chalk.cyan('\n  Triggering Gmail Webhook\n'));
  console.log(chalk.gray('  (Stub — Gmail webhook execution not implemented)\n'));
}

module.exports = webhooks;
