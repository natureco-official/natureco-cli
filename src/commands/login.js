const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { saveApiKey } = require('../utils/config');
const { validateApiKey } = require('../utils/api');

async function login() {
  console.clear();

  console.log('');
  console.log(chalk.green.bold('  (\\_/)'));
  console.log(chalk.green.bold('  (•ᴥ•)'));
  console.log(chalk.green('  />🌿'));
  console.log('');
  console.log(chalk.green.bold('  NatureCo CLI — Giriş'));
  console.log(chalk.gray('  API key\'ini gir ve başla.\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log('');
  console.log(chalk.gray('  API key almak için: ') + chalk.cyan('developers.natureco.me'));
  console.log('');

  const { apiKey } = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: '  API Key:',
    mask: '*',
    validate: (v) => {
      if (!v.trim()) return 'API key boş olamaz';
      return true;
    },
  }]);

  console.log('');
  console.log(chalk.gray('  Doğrulanıyor...'));

  const result = await validateApiKey(apiKey.trim());

  if (!result.valid) {
    console.log(chalk.red(`\n  ❌ ${result.error || 'Geçersiz API key'}\n`));
    process.exit(1);
  }

  if (result.user?.email) {
    console.log(chalk.gray(`  Hoş geldin, ${chalk.white(result.user.email)}`));
  }

  saveApiKey(apiKey.trim());

  console.log(chalk.green('\n  ✓ Giriş başarılı!'));
  console.log(chalk.gray('  Config: ~/.natureco/config.json'));
  console.log('');
  console.log(chalk.gray('  Başlamak için: ') + chalk.cyan('natureco chat'));
  console.log('');
}

module.exports = login;
