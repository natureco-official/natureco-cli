const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const acc = require('../utils/natureco-account');
const { getLang } = require('../utils/i18n');
const { foldTr } = require('../utils/tr-text');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

/**
 * `natureco account [login|logout|whoami]` — one NatureCo account (SSO).
 * Separate from the developers.natureco.me API-KEY login (`natureco login`):
 * this is your personal identity with your natureco.me account, shared
 * across the whole ecosystem.
 */
async function account(action) {
  const sub = foldTr(action || 'whoami');
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
  console.log(chalk.green.bold('  ' + L('NatureCo Hesabı — Giriş', 'NatureCo Account — Sign in')));
  console.log(chalk.gray('  ' + L('natureco.me hesabınla ekosistemin her yerinde tek kimlik.', 'One identity across the whole ecosystem with your natureco.me account.') + '\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)) + '\n');

  const { email } = await inquirer.prompt([{
    type: 'input',
    name: 'email',
    message: L('  E-posta:', '  Email:'),
    validate: (v) => (/.+@.+\..+/.test((v || '').trim()) ? true : L('Geçerli bir e-posta gir', 'Enter a valid email')),
  }]);

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: L('  Giriş yöntemi:', '  Sign-in method:'),
    choices: [
      { name: L('Şifre', 'Password'), value: 'password' },
      { name: L('E-postama kod gönder (OTP)', 'Email me a code (OTP)'), value: 'otp' },
    ],
  }]);

  try {
    if (method === 'password') {
      const { password } = await inquirer.prompt([{ type: 'password', name: 'password', message: L('  Şifre:', '  Password:'), mask: '*' }]);
      console.log(chalk.gray('\n  ' + L('Doğrulanıyor...', 'Verifying...')));
      await acc.loginWithPassword(email.trim(), password);
    } else {
      console.log(chalk.gray('\n  ' + L('Gönderiliyor...', 'Sending...')));
      await acc.sendOtp(email.trim());
      console.log(chalk.gray('  ') + chalk.cyan(email.trim()) + chalk.gray(L(' adresine e-posta gönderildi.', ' — email sent.')));
      console.log(chalk.gray('  ' + L('6 haneli kod geldiyse kodu, giriş linki geldiyse linki yapıştır.', 'Paste the 6-digit code, or the login link if you got one.')));
      const { token } = await inquirer.prompt([{
        type: 'input', name: 'token', message: L('  Kod veya giriş linki:', '  Code or login link:'),
        validate: (v) => ((v || '').trim().length >= 6 ? true : L('Kodu ya da linki gir', 'Enter the code or link')),
      }]);
      console.log(chalk.gray('\n  ' + L('Doğrulanıyor...', 'Verifying...')));
      const val = token.trim();
      if (/^https?:\/\//i.test(val) || val.includes('token')) {
        await acc.verifyLink(val);
      } else {
        await acc.verifyOtp(email.trim(), val);
      }
    }
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${err.message || L('Giriş başarısız', 'Sign-in failed')}\n`));
    process.exit(1);
  }

  const me = await acc.whoami();
  console.log(chalk.green('\n  ✓ ' + L('Giriş başarılı!', 'Signed in!')));
  if (me && me.email) console.log(chalk.gray('  ' + L('Hoş geldin, ', 'Welcome, ')) + chalk.white(me.email));
  console.log(chalk.gray('  ' + L('Oturum: ', 'Session: ') + '~/.natureco/auth.json'));
  console.log('');
}

async function doLogout() {
  if (!acc.isLoggedIn()) {
    console.log(chalk.gray('\n  ' + L('Zaten giriş yapılmamış.', 'Not signed in.') + '\n'));
    return;
  }
  const who = acc.currentEmail();
  acc.logout();
  console.log(chalk.green('\n  ✓ ' + L('Çıkış yapıldı', 'Signed out') + `${who ? ' (' + who + ')' : ''}.\n`));
}

async function doWhoami() {
  if (!acc.isLoggedIn()) {
    console.log(chalk.gray('\n  ' + L('NatureCo hesabına giriş yapılmamış.', 'Not signed in to a NatureCo account.')));
    console.log(chalk.gray('  ' + L('Giriş: ', 'Sign in: ')) + chalk.cyan('natureco account login') + '\n');
    return;
  }
  console.log(chalk.gray('\n  ' + L('Doğrulanıyor...', 'Verifying...')));
  const me = await acc.whoami();
  if (!me) {
    console.log(chalk.yellow('\n  ⚠ ' + L('Oturum süresi dolmuş görünüyor. Tekrar giriş yap: ', 'Your session looks expired. Sign in again: ')) + chalk.cyan('natureco account login') + '\n');
    return;
  }
  console.log(chalk.green.bold('\n  ⬡ ' + L('NatureCo Hesabı', 'NatureCo Account')));
  console.log(chalk.gray('  ' + L('E-posta: ', 'Email: ')) + chalk.white(me.email || '-'));
  console.log(chalk.gray('  ID:      ') + chalk.gray(me.id || '-'));
  console.log('');
}

module.exports = account;
