const chalk = require('chalk');
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
      console.log(chalk.red('\n❌ Chat ID belirtmelisiniz\n'));
      console.log(chalk.gray('Kullanım: natureco telegram allow <chatId>\n'));
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
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }

  // v5.4.21: Eğer zaten token kaydedilmişse, kullanıcıya sor — değiştirmek ister mi?
  if (config.telegramToken) {
    const masked = config.telegramToken.slice(0, 15) + '...' + config.telegramToken.slice(-5);
    console.log(chalk.green('\n✓ Telegram token zaten kayıtlı: ' + masked));
    console.log(chalk.gray('  Bot ID: ' + (config.telegramBotId || 'yok')));
    console.log(chalk.gray('  İzinli chat: ' + (config.telegramAllowedChats || []).join(', ') + '\n'));
    const ans = await inquirer.prompt([{
      type: 'confirm',
      name: 'change',
      message: 'Token değiştirmek istiyor musun?',
      default: false,
    }]);
    if (!ans.change) {
      console.log(chalk.green('\n✅ Mevcut token kullanılacak.\n'));
      console.log(chalk.gray('Gateway başlat: natureco gateway start\n'));
      return;
    }
  }

  console.log(chalk.yellow('\n⏳ Telegram bot bağlantısı hazırlanıyor...\n'));
  console.log(chalk.gray('Telegram bot token almak için:'));
  console.log(chalk.gray('1. Telegram\'da @BotFather\'ı aç'));
  console.log(chalk.gray('2. /newbot komutunu gönder'));
  console.log(chalk.gray('3. Bot adı ve kullanıcı adı belirle'));
  console.log(chalk.gray('4. Aldığın token\'ı buraya gir\n'));
  
  process.stdin.resume();
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Telegram bot token:',
      validate: (val) => {
        if (val.trim() === '') return 'Token boş olamaz';
        if (!val.includes(':')) return 'Geçersiz token formatı (örnek: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)';
        return true;
      },
    },
  ]);
  
  console.log(chalk.yellow('\n⏳ Telegram Chat ID almak için:\n'));
  console.log(chalk.gray('1. Telegram\'da @userinfobot veya @getmyid_bot\'a mesaj gönder'));
  console.log(chalk.gray('2. Sana chat ID\'ni söyleyecek'));
  console.log(chalk.gray('3. Chat ID\'yi buraya gir (örnek: 123456789)\n'));
  
  const chatIdAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'chatId',
      message: 'Telegram Chat ID\'n:',
      validate: (val) => {
        if (val.trim() === '') return 'Chat ID boş olamaz';
        if (!/^-?\d+$/.test(val.trim())) return 'Geçersiz Chat ID formatı (sadece rakam olmalı)';
        return true;
      },
    },
  ]);
  
  // Telegram için bot ID oluştur (timestamp-based)
  const botId = `telegram_${Date.now()}`;
  
  console.log(chalk.yellow('\n⏳ Telegram bağlantısı kaydediliyor...\n'));
  
  // Save to config (v2.x - no backend call)
  config.telegramToken = answers.token.trim();
  config.telegramBotId = botId;
  config.telegramAllowedChats = [chatIdAnswer.chatId.trim()];
  saveConfig(config);
  
  console.log(chalk.green('✅ Telegram bot token kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Token:'), chalk.white(answers.token.slice(0, 20) + '...'));
  console.log(chalk.cyan('İzin verilen chat:'), chalk.white(chatIdAnswer.chatId.trim()));
  console.log(chalk.gray('\nSession kaydedildi: ~/.natureco/config.json'));
  console.log(chalk.gray('Başka chat eklemek için: natureco telegram allow <chatId>'));
  
  console.log(chalk.green('\n✅ Kurulum tamamlandı!\n'));
  console.log(chalk.yellow('Gateway ile başlatmak için:'), chalk.cyan('natureco gateway start'));
  console.log(chalk.gray('Gateway, Telegram botunu otomatik olarak başlatacak.\n'));
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
    console.log(chalk.cyan('İzin listesi:'), chalk.gray('Boş (herkesten mesaj kabul edilir)'));
  } else {
    console.log(chalk.cyan('İzin listesi:'));
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
    console.log(chalk.red('\n❌ Geçersiz Chat ID formatı\n'));
    console.log(chalk.gray('Chat ID sadece rakamlardan oluşmalı (örnek: 123456789 veya -123456789)\n'));
    process.exit(1);
  }
  
  const allowedChats = config.telegramAllowedChats || [];
  
  if (allowedChats.includes(normalized)) {
    console.log(chalk.yellow('\n⚠️  Bu chat ID zaten izin listesinde\n'));
    return;
  }
  
  allowedChats.push(normalized);
  config.telegramAllowedChats = allowedChats;
  saveConfig(config);
  
  console.log(chalk.green('\n✅ Chat ID izin listesine eklendi\n'));
  console.log(chalk.cyan('Chat ID:'), chalk.white(normalized));
  console.log(chalk.cyan('Toplam:'), chalk.white(`${allowedChats.length} chat`));
  console.log(chalk.gray('\nGateway\'i yeniden başlatın: natureco gateway stop && natureco gateway start\n'));
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
    console.log(chalk.red('\n❌ Once natureco telegram connect yapin\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n🤖 Telegram bot calistiriliyor, ilk mesaji bekliyorum...\n'));
  console.log(chalk.gray('Telegramda botunuza /start yazin veya bir mesaj gonderin\n'));

  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(config.telegramToken, { polling: true });

  let detected = false;

  bot.on('message', (msg) => {
    if (detected) return;
    detected = true;

    const chatId = String(msg.chat.id);
    const name = msg.from?.first_name || msg.from?.username || 'Bilinmeyen';

    console.log(chalk.green('\n✓ Mesaj alindi!'));
    console.log(chalk.cyan(`  Kullanici: ${name}`));
    console.log(chalk.cyan(`  Chat ID: ${chatId}`));

    // Kaydet
    if (!config.telegramAllowedChats) config.telegramAllowedChats = [];
    if (!config.telegramAllowedChats.includes(chatId)) {
      config.telegramAllowedChats.push(chatId);
    }
    saveConfig(config);

    console.log(chalk.green('\n✅ Chat ID kaydedildi: ' + chatId + '\n'));
    bot.stopPolling();
    process.exit(0);
  });

  // 60 saniye timeout
  setTimeout(() => {
    if (!detected) {
      console.log(chalk.red('\n⏱ 60 saniye icinde mesaj gelmedi. Tekrar deneyin.\n'));
      bot.stopPolling();
      process.exit(1);
    }
  }, 60000);
}
