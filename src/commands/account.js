const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const acc = require('../utils/natureco-account');

/**
 * `natureco account [login|logout|whoami]` — tek NatureCo hesabı (SSO).
 * developers.natureco.me API-KEY girişinden (`natureco login`) AYRIDIR:
 * bu, natureco.me hesabınla kişi kimliği; ekosistem geneli paylaşılır.
 */
async function account(action) {
  const sub = (action || 'whoami').toLowerCase();
  if (sub === 'login' || sub === 'giris' || sub === 'giriş') return doLogin();
  if (sub === 'logout' || sub === 'cikis' || sub === 'çıkış') return doLogout();
  return doWhoami();
}

async function doLogin() {
  console.log('');
  console.log(chalk.green.bold('  (\\_/)'));
  console.log(chalk.green.bold('  (•ᴥ•)'));
  console.log(chalk.green('  />🌿'));
  console.log('');
  console.log(chalk.green.bold('  NatureCo Hesabı — Giriş'));
  console.log(chalk.gray('  natureco.me hesabınla ekosistemin her yerinde tek kimlik.\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)) + '\n');

  const { email } = await inquirer.prompt([{
    type: 'input',
    name: 'email',
    message: '  E-posta:',
    validate: (v) => (/.+@.+\..+/.test((v || '').trim()) ? true : 'Geçerli bir e-posta gir'),
  }]);

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: '  Giriş yöntemi:',
    choices: [
      { name: 'Şifre', value: 'password' },
      { name: 'E-postama kod gönder (OTP)', value: 'otp' },
    ],
  }]);

  try {
    if (method === 'password') {
      const { password } = await inquirer.prompt([{ type: 'password', name: 'password', message: '  Şifre:', mask: '*' }]);
      console.log(chalk.gray('\n  Doğrulanıyor...'));
      await acc.loginWithPassword(email.trim(), password);
    } else {
      console.log(chalk.gray('\n  Kod gönderiliyor...'));
      await acc.sendOtp(email.trim());
      console.log(chalk.gray('  ') + chalk.cyan(email.trim()) + chalk.gray(' adresine 6 haneli kod gönderildi.'));
      const { token } = await inquirer.prompt([{
        type: 'input', name: 'token', message: '  Koddan gelen 6 hane:',
        validate: (v) => ((v || '').trim().length >= 6 ? true : 'Kodu gir'),
      }]);
      console.log(chalk.gray('\n  Doğrulanıyor...'));
      await acc.verifyOtp(email.trim(), token.trim());
    }
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${err.message || 'Giriş başarısız'}\n`));
    process.exit(1);
  }

  const me = await acc.whoami();
  console.log(chalk.green('\n  ✓ Giriş başarılı!'));
  if (me && me.email) console.log(chalk.gray('  Hoş geldin, ') + chalk.white(me.email));
  console.log(chalk.gray('  Oturum: ~/.natureco/auth.json'));
  console.log('');
}

async function doLogout() {
  if (!acc.isLoggedIn()) {
    console.log(chalk.gray('\n  Zaten giriş yapılmamış.\n'));
    return;
  }
  const who = acc.currentEmail();
  acc.logout();
  console.log(chalk.green(`\n  ✓ Çıkış yapıldı${who ? ' (' + who + ')' : ''}.\n`));
}

async function doWhoami() {
  if (!acc.isLoggedIn()) {
    console.log(chalk.gray('\n  NatureCo hesabına giriş yapılmamış.'));
    console.log(chalk.gray('  Giriş: ') + chalk.cyan('natureco account login') + '\n');
    return;
  }
  console.log(chalk.gray('\n  Doğrulanıyor...'));
  const me = await acc.whoami();
  if (!me) {
    console.log(chalk.yellow('\n  ⚠ Oturum süresi dolmuş görünüyor. Tekrar giriş yap: ') + chalk.cyan('natureco account login') + '\n');
    return;
  }
  console.log(chalk.green.bold('\n  ⬡ NatureCo Hesabı'));
  console.log(chalk.gray('  E-posta: ') + chalk.white(me.email || '-'));
  console.log(chalk.gray('  ID:      ') + chalk.gray(me.id || '-'));
  console.log('');
}

module.exports = account;
