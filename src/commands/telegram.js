const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');

async function telegram(action, chatId) {
  if (!action || action === 'connect') {
    return connectTelegram();
  }
  
  if (action === 'disconnect') {
    return disconnectTelegram();
  }
  
  if (action === 'status') {
    return statusTelegram();
  }
  
  if (action === 'allow') {
    if (!chatId) {
      console.log(chalk.red(L('\n❌ Chat ID belirtmelisiniz\n', '\n❌ You must specify a Chat ID\n')));
      console.log(chalk.gray(L('Kullanım: natureco telegram allow <chatId>\n', 'Usage: natureco telegram allow <chatId>\n')));
      process.exit(1);
    }
    return allowChat(chatId);
  }

  if (action === 'chatid' || action === 'auto-allow') {
    return autoDetectChatId();
  }
  
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status, allow, chatid\n'));
  console.log(chalk.gray('  chatid: Run bot, wait for first message, auto-detect chat ID'));
  process.exit(1);
}

async function connectTelegram() {
  const config = getConfig();

  if (!config.providerUrl) {
    console.log(chalk.red(L('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n', '\n❌ Setup not done. Run "natureco setup" first.\n')));
    process.exit(1);
  }

  // v5.4.21: Eğer zaten token kaydedilmişse, kullanıcıya sor — değiştirmek ister mi?
  if (config.telegramToken) {
    const masked = config.telegramToken.slice(0, 15) + '...' + config.telegramToken.slice(-5);
    console.log(chalk.green(L('\n✓ Telegram token zaten kayıtlı: ', '\n✓ Telegram token already saved: ') + masked));
    console.log(chalk.gray('  Bot ID: ' + (config.telegramBotId || L('yok', 'none'))));
    console.log(chalk.gray(L('  İzinli chat: ', '  Allowed chat: ') + (config.telegramAllowedChats || []).join(', ') + '\n'));
    const ans = await inquirer.prompt([{
      type: 'confirm',
      name: 'change',
      message: L('Token değiştirmek istiyor musun?', 'Do you want to change the token?'),
      default: false,
    }]);
    if (!ans.change) {
      console.log(chalk.green(L('\n✅ Mevcut token kullanılacak.\n', '\n✅ Existing token will be used.\n')));
      console.log(chalk.gray(L('Gateway başlat: natureco gateway start\n', 'Start gateway: natureco gateway start\n')));
      return;
    }
  }

  console.log(chalk.yellow(L('\n⏳ Telegram bot bağlantısı hazırlanıyor...\n', '\n⏳ Preparing Telegram bot connection...\n')));
  console.log(chalk.gray(L('Telegram bot token almak için:', 'To get a Telegram bot token:')));
  console.log(chalk.gray(L('1. Telegram\'da @BotFather\'ı aç', '1. Open @BotFather on Telegram')));
  console.log(chalk.gray(L('2. /newbot komutunu gönder', '2. Send the /newbot command')));
  console.log(chalk.gray(L('3. Bot adı ve kullanıcı adı belirle', '3. Set a bot name and username')));
  console.log(chalk.gray(L('4. Aldığın token\'ı buraya gir\n', '4. Enter the token you received here\n')));
  
  process.stdin.resume();
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Telegram bot token:',
      validate: (val) => {
        if (val.trim() === '') return L('Token boş olamaz', 'Token cannot be empty');
        if (!val.includes(':')) return L('Geçersiz token formatı (örnek: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)', 'Invalid token format (example: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)');
        return true;
      },
    },
  ]);
  
  console.log(chalk.yellow(L('\n⏳ Telegram Chat ID almak için:\n', '\n⏳ To get your Telegram Chat ID:\n')));
  console.log(chalk.gray(L('1. Telegram\'da @userinfobot veya @getmyid_bot\'a mesaj gönder', '1. Message @userinfobot or @getmyid_bot on Telegram')));
  console.log(chalk.gray(L('2. Sana chat ID\'ni söyleyecek', '2. It will tell you your chat ID')));
  console.log(chalk.gray(L('3. Chat ID\'yi buraya gir (örnek: 123456789)\n', '3. Enter the Chat ID here (example: 123456789)\n')));
  
  const chatIdAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'chatId',
      message: L('Telegram Chat ID\'n:', 'Your Telegram Chat ID:'),
      validate: (val) => {
        if (val.trim() === '') return L('Chat ID boş olamaz', 'Chat ID cannot be empty');
        if (!/^-?\d+$/.test(val.trim())) return L('Geçersiz Chat ID formatı (sadece rakam olmalı)', 'Invalid Chat ID format (must be digits only)');
        return true;
      },
    },
  ]);
  
  // Telegram için bot ID oluştur (timestamp-based)
  const botId = `telegram_${Date.now()}`;
  
  console.log(chalk.yellow(L('\n⏳ Telegram bağlantısı kaydediliyor...\n', '\n⏳ Saving Telegram connection...\n')));
  
  // Save to config (v2.x - no backend call)
  config.telegramToken = answers.token.trim();
  config.telegramBotId = botId;
  config.telegramAllowedChats = [chatIdAnswer.chatId.trim()];
  saveConfig(config);
  
  console.log(chalk.green(L('✅ Telegram bot token kaydedildi!\n', '✅ Telegram bot token saved!\n')));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Token:'), chalk.white(answers.token.slice(0, 20) + '...'));
  console.log(chalk.cyan(L('İzin verilen chat:', 'Allowed chat:')), chalk.white(chatIdAnswer.chatId.trim()));
  console.log(chalk.gray(L('\nSession kaydedildi: ~/.natureco/config.json', '\nSession saved: ~/.natureco/config.json')));
  console.log(chalk.gray(L('Başka chat eklemek için: natureco telegram allow <chatId>', 'To add another chat: natureco telegram allow <chatId>')));
  
  console.log(chalk.green(L('\n✅ Kurulum tamamlandı!\n', '\n✅ Setup complete!\n')));
  console.log(chalk.yellow(L('Gateway ile başlatmak için:', 'To start with the gateway:')), chalk.cyan('natureco gateway start'));
  console.log(chalk.gray(L('Gateway, Telegram botunu otomatik olarak başlatacak.\n', 'The gateway will start the Telegram bot automatically.\n')));
}

async function disconnectTelegram() {
  const config = getConfig();
  
  if (!config.telegramToken) {
    console.log(chalk.gray('\n⚠️  No Telegram connection found\n'));
    return;
  }
  
  process.stdin.resume();
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to disconnect Telegram?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  
  // Remove from config
  delete config.telegramToken;
  delete config.telegramBotId;
  delete config.telegramAllowedChats;
  saveConfig(config);
  
  console.log(chalk.green('\n✅ Telegram disconnected\n'));
  console.log(chalk.gray('Note: The bot is still active on Telegram.'));
  console.log(chalk.gray('You may need to manually delete it via @BotFather.\n'));
}

function statusTelegram() {
  const config = getConfig();
  
  if (!config.telegramToken) {
    console.log(chalk.gray('\n⚠️  Telegram not connected\n'));
    console.log(chalk.gray('Connect with: natureco telegram connect\n'));
    return;
  }
  
  console.log(chalk.green('\n✅ Telegram connected\n'));
  console.log(chalk.cyan('Token:'), chalk.white(config.telegramToken.slice(0, 20) + '...'));
  
  if (config.telegramBotId) {
    console.log(chalk.cyan('Bot ID:'), chalk.white(config.telegramBotId));
  }
  
  // Show allowed chats
  const allowedChats = config.telegramAllowedChats || [];
  if (allowedChats.length === 0) {
    console.log(chalk.cyan(L('İzin listesi:', 'Allowlist:')), chalk.gray(L('Boş (herkesten mesaj kabul edilir)', 'Empty (accepts messages from anyone)')));
  } else {
    console.log(chalk.cyan(L('İzin listesi:', 'Allowlist:')));
    allowedChats.forEach(chatId => console.log(chalk.white(`  - ${chatId}`)));
  }
  
  console.log(chalk.gray('\nDisconnect with: natureco telegram disconnect\n'));
}

function allowChat(chatId) {
  const config = getConfig();
  
  if (!config.telegramToken) {
    console.log(chalk.red('\n❌ Telegram not connected\n'));
    console.log(chalk.gray('Connect first with: natureco telegram connect\n'));
    process.exit(1);
  }
  
  // Validate chat ID (should be numeric, can be negative for groups)
  const normalized = chatId.trim();
  
  if (!/^-?\d+$/.test(normalized)) {
    console.log(chalk.red(L('\n❌ Geçersiz Chat ID formatı\n', '\n❌ Invalid Chat ID format\n')));
    console.log(chalk.gray(L('Chat ID sadece rakamlardan oluşmalı (örnek: 123456789 veya -123456789)\n', 'Chat ID must consist of digits only (example: 123456789 or -123456789)\n')));
    process.exit(1);
  }
  
  const allowedChats = config.telegramAllowedChats || [];
  
  if (allowedChats.includes(normalized)) {
    console.log(chalk.yellow(L('\n⚠️  Bu chat ID zaten izin listesinde\n', '\n⚠️  This chat ID is already in the allowlist\n')));
    return;
  }
  
  allowedChats.push(normalized);
  config.telegramAllowedChats = allowedChats;
  saveConfig(config);
  
  console.log(chalk.green(L('\n✅ Chat ID izin listesine eklendi\n', '\n✅ Chat ID added to allowlist\n')));
  console.log(chalk.cyan('Chat ID:'), chalk.white(normalized));
  console.log(chalk.cyan(L('Toplam:', 'Total:')), chalk.white(`${allowedChats.length} chat`));
  console.log(chalk.gray(L('\nGateway\'i yeniden başlatın: natureco gateway stop && natureco gateway start\n', '\nRestart the gateway: natureco gateway stop && natureco gateway start\n')));
}

module.exports = telegram;


/**
 * v5.5.2: Otomatik chat ID algilama
 * Bot'u polling'de calistirir, ilk mesaji gelene kadar bekler
 * Chat ID'yi otomatik kaydeder
 */
async function autoDetectChatId() {
  const config = getConfig();
  if (!config.telegramToken) {
    console.log(chalk.red(L('\n❌ Once natureco telegram connect yapin\n', '\n❌ First run natureco telegram connect\n')));
    process.exit(1);
  }

  console.log(chalk.cyan(L('\n🤖 Telegram bot calistiriliyor, ilk mesaji bekliyorum...\n', '\n🤖 Running Telegram bot, waiting for first message...\n')));
  console.log(chalk.gray(L('Telegramda botunuza /start yazin veya bir mesaj gonderin\n', 'Send /start or a message to your bot on Telegram\n')));

  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(config.telegramToken, { polling: true });

  let detected = false;

  bot.on('message', (msg) => {
    if (detected) return;
    detected = true;

    const chatId = String(msg.chat.id);
    const name = msg.from?.first_name || msg.from?.username || L('Bilinmeyen', 'Unknown');

    console.log(chalk.green(L('\n✓ Mesaj alindi!', '\n✓ Message received!')));
    console.log(chalk.cyan(`  ${L('Kullanici', 'User')}: ${name}`));
    console.log(chalk.cyan(`  Chat ID: ${chatId}`));

    // Kaydet
    if (!config.telegramAllowedChats) config.telegramAllowedChats = [];
    if (!config.telegramAllowedChats.includes(chatId)) {
      config.telegramAllowedChats.push(chatId);
    }
    saveConfig(config);

    console.log(chalk.green(L('\n✅ Chat ID kaydedildi: ', '\n✅ Chat ID saved: ') + chatId + '\n'));
    bot.stopPolling();
    process.exit(0);
  });

  // 60 saniye timeout
  setTimeout(() => {
    if (!detected) {
      console.log(chalk.red(L('\n⏱ 60 saniye icinde mesaj gelmedi. Tekrar deneyin.\n', '\n⏱ No message within 60 seconds. Try again.\n')));
      bot.stopPolling();
      process.exit(1);
    }
  }, 60000);
}
