const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { saveApiKey } = require('../utils/config');
const { validateApiKey } = require('../utils/api');
const { getLang } = require('../utils/i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

async function login() {
  console.clear();

  console.log('');
  console.log(chalk.green.bold('  (\\_/)'));
  console.log(chalk.green.bold('  (•ᴥ•)'));
  console.log(chalk.green('  />🌿'));
  console.log('');
  console.log(chalk.green.bold('  ' + L('NatureCo CLI — Giriş', 'NatureCo CLI — Sign in')));
  console.log(chalk.gray('  ' + L("API key'ini gir ve başla.", 'Enter your API key to get started.') + '\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log('');
  console.log(chalk.gray('  ' + L('API key almak için: ', 'Get an API key at: ')) + chalk.cyan('developers.natureco.me'));
  console.log('');

  const { apiKey } = await inquirer.prompt([{
    type: 'password',
    name: 'apiKey',
    message: '  API Key:',
    mask: '*',
    validate: (v) => {
      if (!v.trim()) return L('API key boş olamaz', "API key can't be empty");
      return true;
    },
  }]);

  console.log('');
  console.log(chalk.gray('  ' + L('Doğrulanıyor...', 'Verifying...')));

  const result = await validateApiKey(apiKey.trim());

  if (!result.valid) {
    console.log(chalk.red(`\n  ❌ ${result.error || L('Geçersiz API key', 'Invalid API key')}\n`));
    process.exit(1);
  }

  if (result.user?.email) {
    console.log(chalk.gray(`  ${L('Hoş geldin,', 'Welcome,')} ${chalk.white(result.user.email)}`));
  }

  saveApiKey(apiKey.trim());

  console.log(chalk.green('\n  ✓ ' + L('Giriş başarılı!', 'Signed in!')));
  console.log(chalk.gray('  Config: ~/.natureco/config.json'));
  console.log('');
  console.log(chalk.gray('  ' + L('Başlamak için: ', 'To get started: ')) + chalk.cyan('natureco chat'));
  console.log('');
}

module.exports = login;
