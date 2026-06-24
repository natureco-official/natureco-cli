const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

const BASE_DIR = path.join(os.homedir(), '.natureco');

function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function uninstall(params) {
  try {
    const [action] = params || [];

    if (action === 'dry-run') return cmdDryRun();

    if (!action || action === 'run') return await cmdRun();

    console.log(chalk.red(`\n  Unknown uninstall action: ${action}\n`));
    console.log(chalk.gray('  Usage: natureco uninstall [run|dry-run]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Uninstall error: ${err.message}\n`));
  }
}

function cmdDryRun() {
  console.log(chalk.cyan('\n  Uninstall — Dry Run\n'));
  console.log(chalk.gray('  Would remove:\n'));

  if (fs.existsSync(BASE_DIR)) {
    console.log(chalk.gray('  • ') + chalk.white('~/.natureco/') + chalk.gray(' — all config and data'));
  } else {
    console.log(chalk.gray('  • ') + chalk.white('~/.natureco/') + chalk.gray(' — not found'));
  }

  console.log(chalk.gray('  • ') + chalk.white('npm uninstall -g natureco-cli'));
  console.log(chalk.gray('  • ') + chalk.white('Remove global symlink\n'));
}

async function cmdRun() {
  console.log(chalk.cyan('\n  Uninstall NatureCo\n'));

  const answer = await rlQuestion(chalk.red('  This will remove all NatureCo data. Continue? [y/N]: '));
  if (answer !== 'y' && answer !== 'yes') {
    console.log(chalk.gray('\n  Cancelled.\n'));
    return;
  }

  if (fs.existsSync(BASE_DIR)) {
    console.log(chalk.gray('  Removing ~/.natureco/...'));
    fs.rmSync(BASE_DIR, { recursive: true, force: true });
    console.log(chalk.green('  ✓ Removed ~/.natureco/'));
  }

  console.log(chalk.gray('  Uninstalling global package...'));
  try {
    execSync('npm uninstall -g natureco-cli', { stdio: 'inherit' });
    console.log(chalk.green('  ✓ Global package uninstalled'));
  } catch (e) {
    console.log(chalk.yellow('  Could not uninstall package: ' + e.message));
    console.log(chalk.gray('  Try manually: npm uninstall -g natureco-cli'));
  }

  console.log(chalk.green('\n  Uninstall complete.\n'));
}

module.exports = uninstall;
