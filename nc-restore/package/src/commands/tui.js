const chalk = require('chalk');

function tui(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'start') return cmdStart();
  if (action === 'local') return cmdLocal();
  if (action === 'status') return cmdStatus();

  console.log(chalk.red(`\n  Unknown tui action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco tui <action>'));
  console.log(chalk.gray('  Actions: start, local, status\n'));
  process.exit(1);
}

function cmdStart() {
  console.log(chalk.cyan('\n  TUI Launcher\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('  TUI would launch here.'));
  console.log(chalk.gray('  This is a stub — no real TUI implementation.\n'));
}

function cmdLocal() {
  console.log(chalk.cyan('\n  Local TUI\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('  Local TUI would launch here.'));
  console.log(chalk.gray('  This is a stub — no real TUI implementation.\n'));
}

function cmdStatus() {
  console.log(chalk.cyan('\n  TUI Status\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Status:')}  ${chalk.gray('Not running')}`);
  console.log(`  ${chalk.white('Type:')}    ${chalk.gray('Terminal UI')}`);
  console.log('');
  console.log(chalk.gray('  Start with: ') + chalk.cyan('natureco tui start'));
  console.log(chalk.gray('  Local:      ') + chalk.cyan('natureco tui local'));
  console.log('');
}

module.exports = tui;
