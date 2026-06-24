/**
 * v5.5.0: Kanal baglanti yardimcisi
 * Tum kanallar ayni "zaten kayitli" kontrolunu kullaniyor
 */

const inquirer = require('../utils/inquirer-wrapper');
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
  const token = String(config[channelKey]);
  const masked = token.length > 20
    ? token.slice(0, 15) + '...' + token.slice(-5)
    : token.slice(0, 3) + '***';

  console.log(chalk.green('\n✓ ' + channelName + ' token zaten kayıtlı: ' + masked));

  if (config[channelKey + 'BotId']) {
    console.log(chalk.gray('  Bot ID: ' + config[channelKey + 'BotId']));
  }
  if (config[channelKey.replace('Token', 'AllowedChats')]) {
    console.log(chalk.gray('  İzinli sohbet: ' + config[channelKey.replace('Token', 'AllowedChats')].join(', ')));
  }
  console.log('');

  const ans = await inquirer.prompt([{
    type: 'confirm',
    name: 'change',
    message: 'Token değiştirmek istiyor musun?',
    default: false,
  }]);

  if (!ans.change) {
    console.log(chalk.green('\n✅ Mevcut token kullanılacak.\n'));
    console.log(chalk.gray('Gateway başlatmak için: natureco gateway start\n'));
    return false; // Mevcut kullanilacak
  }
  return true; // Yeni alinacak
}

module.exports = { checkExistingToken };
