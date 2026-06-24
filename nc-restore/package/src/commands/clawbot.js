const chalk = require('chalk');

function clawbot(args) {
  const [action, ...params] = args || [];

  if (action === 'qr') {
    const qr = require('../commands/qr');
    return qr(['--format', 'clawbot', ...params]);
  }

  console.log(chalk.cyan('\n  🤖 ClawBot\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('  Legacy namespace for ClawBot operations.\n'));
  console.log(`  ${chalk.white('Subcommands:')}`);
  console.log(`    ${chalk.cyan('qr')}     ${chalk.gray('Show QR pairing code for ClawBot')}`);
  console.log();
}

module.exports = clawbot;
