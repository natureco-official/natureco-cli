const chalk = require('chalk');
const { execSync } = require('child_process');

async function crestodian(args) {
  const fixMode = args.includes('--fix') || args.includes('-f');

  console.log(chalk.cyan('\n  🛠️  Crestodian — Setup & Repair Assistant\n'));
  console.log(chalk.gray('  Diagnosing your NatureCo installation...\n'));

  const checks = [];

  // Check Node version
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0]);
  checks.push({
    name: 'Node.js version',
    ok: nodeMajor >= 18,
    message: `Node ${process.version} (18+ required)`,
    fix: 'Install Node.js 18+: https://nodejs.org'
  });

  // Check npm
  try {
    const npmVer = execSync('npm --version', { encoding: 'utf8' }).trim();
    checks.push({ name: 'npm', ok: true, message: `npm ${npmVer}` });
  } catch {
    checks.push({ name: 'npm', ok: false, message: 'npm not found', fix: 'Install Node.js (includes npm)' });
  }

  // Check config
  try {
    const { getConfig } = require('../utils/config');
    const config = getConfig();
    checks.push({
      name: 'Configuration',
      ok: !!(config.openaiApiKey || config.anthropicApiKey || config.provider),
      message: config.provider ? `Provider: ${config.provider}` : 'Not configured',
      fix: 'Run: natureco configure'
    });
  } catch {
    checks.push({ name: 'Configuration', ok: false, message: 'Config error', fix: 'Run: natureco setup' });
  }

  // Check git
  try {
    execSync('git --version', { stdio: 'pipe', encoding: 'utf8' });
    checks.push({ name: 'Git', ok: true, message: 'Available' });
  } catch {
    checks.push({ name: 'Git', ok: false, message: 'Not found', fix: 'Install git: https://git-scm.com' });
  }

  // Check Playwright
  try {
    require.resolve('playwright');
    checks.push({ name: 'Playwright', ok: true, message: 'Installed' });
  } catch {
    checks.push({ name: 'Playwright', ok: true, message: 'Optional (not installed)', optional: true });
  }

  // Print results
  const failed = checks.filter(c => !c.ok);
  for (const check of checks) {
    const icon = check.ok ? chalk.green('✅') : check.optional ? chalk.gray('⬜') : chalk.red('❌');
    console.log(`  ${icon} ${chalk.white(check.name)} ${chalk.gray('- ' + check.message)}`);
  }

  console.log(chalk.gray('\n  ' + '─'.repeat(48)));

  if (failed.length === 0) {
    console.log(chalk.green('\n  ✅ All checks passed!\n'));
  } else {
    console.log(chalk.yellow(`\n  ⚠️  ${failed.length} issue(s) found:\n`));
    for (const f of failed) {
      console.log(`  ${chalk.yellow('●')} ${f.name}: ${f.message}`);
      if (fixMode && f.fix) {
        console.log(`    ${chalk.gray('Fix:')} ${f.fix}`);
      }
    }

    if (fixMode) {
      console.log(chalk.gray('\n  Running fixes...\n'));
      for (const f of failed) {
        if (f.name === 'Configuration') {
          console.log(chalk.gray('  Run: natureco onboard'));
        }
      }
    }

    console.log(chalk.gray('\n  To auto-fix: ') + chalk.cyan('natureco crestodian --fix\n'));
  }
}

module.exports = crestodian;
