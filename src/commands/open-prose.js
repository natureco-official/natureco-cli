const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

function openProse(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listBundles();
  if (action === 'info') return showInfo();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco open-prose [list|info]\n'));
  process.exit(1);
}

function listBundles() {
  const skillsDir = path.join(__dirname, '..', '..', 'skills');
  console.log(chalk.cyan('\n  📦 OpenProse Skills Bundles\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  let bundles = [];
  if (fs.existsSync(skillsDir)) {
    try {
      bundles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    } catch {}
  }

  bundles = bundles.length > 0 ? bundles : [
    'writing-style.md',
    'code-review.md',
    'documentation.md',
    'prompt-engineering.md'
  ];

  for (const bundle of bundles) {
    console.log(`  ${chalk.cyan('●')} ${chalk.white(bundle.replace('.md', ''))}`);
  }

  if (bundles.length === 0) {
    console.log(chalk.gray('  Yüklü bundle bulunamadı.\n'));
  }

  console.log(chalk.gray('\n  OpenProse, NatureCo\'nun prose skills paketidir.\n'));
  console.log(chalk.gray('  Skills yüklemek için:'));
  console.log(chalk.cyan('    natureco skills install <name>\n'));
}

function showInfo() {
  console.log(chalk.cyan('\n  📖 OpenProse\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('  OpenProse — Prose skills bundle for NatureCo CLI.'));
  console.log(chalk.gray('  Provides writing, review, documentation, and prompt'));
  console.log(chalk.gray('  engineering skill definitions.'));
  console.log();
  console.log(chalk.gray('  Version: 1.0.0'));
  console.log(chalk.gray('  ID: open-prose'));
  console.log(chalk.gray('  Type: skills-bundle'));
  console.log();
  console.log(chalk.gray('  Included skills:'));
  console.log(chalk.cyan('    writing-style') + chalk.gray('    Writing style guide'));
  console.log(chalk.cyan('    code-review') + chalk.gray('     Code review guidelines'));
  console.log(chalk.cyan('    documentation') + chalk.gray('  Documentation best practices'));
  console.log(chalk.cyan('    prompt-engineering') + chalk.gray('  Prompt engineering techniques'));
  console.log();
}

module.exports = openProse;
