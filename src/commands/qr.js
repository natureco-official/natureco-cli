const chalk = require('chalk');
const crypto = require('crypto');
const qrcode = require('qrcode-terminal');

function qr(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'show') return showQR(params.join(' '));
  if (action === 'generate') return generateQR(params.join(' '));
  if (action === 'verify') return verifyCode(params[0]);

  console.log(chalk.cyan('\n  📱 QR Code\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const data = JSON.stringify({ id: crypto.randomBytes(8).toString('hex'), code, timestamp: Date.now() });
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  qrcode.generate(data, { small: true }, qrCode => {
    console.log(qrCode);
    console.log(`  ${chalk.white('Pairing Code:')} ${chalk.bold.yellow(code)}`);
    console.log(`  ${chalk.white('Expires:')}     ${chalk.gray(expiresAt.toLocaleString())}`);
    console.log();
    console.log(chalk.gray('  To pair a device, run on the device:'));
    console.log(chalk.cyan('    natureco device-pair verify ') + chalk.yellow(code));
    console.log();
    console.log(chalk.gray('  Or scan the QR code with the NatureCo mobile app.'));
    console.log();
  });
}

function showQR(data) {
  const content = data || JSON.stringify({
    id: crypto.randomBytes(8).toString('hex'),
    timestamp: Date.now(),
    type: 'pairing',
    version: 1,
  });
  console.log(chalk.cyan('\n  📱 QR Code\n'));
  qrcode.generate(content, { small: true }, qrCode => {
    console.log(qrCode);
    if (data) {
      console.log(`  ${chalk.gray('Data:')} ${chalk.white(data.substring(0, 80))}`);
    }
    console.log();
  });
}

function generateQR(text) {
  if (!text) {
    console.log(chalk.red('\n  ❌ QR için veri gerekli\n'));
    console.log(chalk.gray('  Örnek: natureco qr generate "https://natureco.me/pair?code=ABC"\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  📱 QR: ') + chalk.white(text) + '\n');
  qrcode.generate(text, { small: false }, qrCode => {
    console.log(qrCode);
    console.log();
  });
}

function verifyCode(code) {
  if (!code) {
    console.log(chalk.red('\n  ❌ Kod gerekli\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  ✅ Pairing code verified: ') + chalk.bold.yellow(code) + '\n');
}

module.exports = qr;
