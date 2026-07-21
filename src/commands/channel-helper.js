/**
 * v5.5.0: Kanal baglanti yardimcisi
 * Tum kanallar ayni "zaten kayitli" kontrolunu kullaniyor
 */

const inquirer = require('../utils/inquirer-wrapper');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);

function maskToken(value) {
  const token = String(value || '');
  return token.length > 8 ? `${token.slice(0, 3)}****${token.slice(-3)}` : '****';
}
const chalk = require('chalk');

/**
 * Eger kanal tokeni zaten kayitliysa kullaniciya sor:
 *  - "Token degistirmek istiyor musun?"
 *  - Hayir: mevcut token kullanilir, return false (yeni prompt'a gerek yok)
 *  - Evet: return true (yeni token alinmali)
 */
async function checkExistingToken(config, channelKey, channelName) {
  if (!config[channelKey]) {
    return true; // Yeni token al
  }

  // Mevcut token goster (maskelenmis)
  const masked = maskToken(config[channelKey]);

  console.log(chalk.green('\n✓ ' + channelName + L(' token zaten kayıtlı: ', ' token already saved: ') + masked));

  if (config[channelKey + 'BotId']) {
    console.log(chalk.gray('  Bot ID: ' + config[channelKey + 'BotId']));
  }
  if (config[channelKey.replace('Token', 'AllowedChats')]) {
    console.log(chalk.gray(L('  İzinli sohbet: ', '  Allowed chat: ') + config[channelKey.replace('Token', 'AllowedChats')].join(', ')));
  }
  console.log('');

  const ans = await inquirer.prompt([{
    type: 'confirm',
    name: 'change',
    message: L('Token değiştirmek istiyor musun?', 'Change token?'),
    default: false,
  }]);

  if (!ans.change) {
    console.log(chalk.green(L('\n✅ Mevcut token kullanılacak.\n', '\n✅ Existing token will be used.\n')));
    console.log(chalk.gray(L('Gateway başlatmak için: natureco gateway start\n', 'To start the gateway: natureco gateway start\n')));
    return false; // Mevcut kullanilacak
  }
  return true; // Yeni alinacak
}

module.exports = { checkExistingToken, maskToken };
