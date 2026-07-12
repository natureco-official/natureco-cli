const chalk = require('chalk');
const os = require('os');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);

function system(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return systemStatus();
  if (action === 'events' || action === 'heartbeat') return systemHeartbeat();
  if (action === 'presence') return systemPresence();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco system [status|events|presence]\n', '  Usage: natureco system [status|events|presence]\n')));
  process.exit(1);
}

function systemStatus() {
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);

  console.log(chalk.cyan('\n  💻 System\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Host:')}       ${os.hostname()}`);
  console.log(`  ${chalk.white('Platform:')}   ${process.platform} ${os.release()}`);
  console.log(`  ${chalk.white('Uptime:')}     ${days}d ${hours}h ${mins}m`);
  console.log(`  ${chalk.white('Node:')}       ${process.version}`);
  console.log(`  ${chalk.white('Memory:')}     ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
  console.log(`  ${chalk.white('CPU:')}        ${os.cpus()[0]?.model || 'unknown'}`);
  console.log(`  ${chalk.white('Load:')}       ${os.loadavg().map(l => l.toFixed(2)).join(', ')}`);
  console.log(`  ${chalk.white('PID:')}        ${process.pid}`);
  console.log();
}

function systemHeartbeat() {
  console.log(chalk.cyan(`\n  💓 Heartbeat: ${new Date().toISOString()}\n`));
  console.log(chalk.gray(`  PID: ${process.pid}`));
  console.log(chalk.gray(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`));
  console.log(chalk.gray(`  Status: ${chalk.green('alive')}\n`));
}

function systemPresence() {
  console.log(chalk.cyan('\n  🟢 Presence\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Status:')}   ${chalk.green('online')}`);
  console.log(`  ${chalk.white('Since:')}    ${new Date(Date.now() - process.uptime() * 1000).toISOString()}`);
  console.log(`  ${chalk.white('Host:')}     ${os.hostname()}`);
  console.log(`  ${chalk.white('Version:')} NatureCo CLI`);
  console.log();
}

module.exports = system;
