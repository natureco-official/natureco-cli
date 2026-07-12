const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const inquirer = require('../utils/inquirer-wrapper');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pino = require('pino');
const { getApiKey, getConfig, saveConfig } = require('../utils/config');
const { getBots, sendMessage } = require('../utils/api');
const { loadBaileys } = require('../utils/baileys');
const { NatureCoError, ChannelError, handleError } = require('../utils/errors');

const logger = pino({ level: 'silent' });

// WhatsApp session directory
const WHATSAPP_SESSION_DIR = path.join(os.homedir(), '.natureco', 'whatsapp-sessions');

const { checkExistingToken } = require('./channel-helper');

async function whatsapp(action, number) {
  if (!action || action === 'connect') {
    return connectWhatsApp();
  }
  
  if (action === 'disconnect') {
    return disconnectWhatsApp();
  }
  
  if (action === 'status') {
    return statusWhatsApp();
  }
  
  if (action === 'allow') {
    if (!number) {
      console.log(chalk.red(L('\n❌ Numara belirtmelisiniz\n', '\n❌ You must specify a number\n')));
      console.log(chalk.gray(L('Kullanım: natureco whatsapp allow <numara>\n', 'Usage: natureco whatsapp allow <number>\n')));
      process.exit(1);
    }
    return allowNumber(number);
  }
  
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status, allow\n'));
  process.exit(1);
}

async function connectWhatsApp() {
  const config = getConfig();
  
  if (!config.providerUrl) {
    console.log(chalk.red(L('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n', '\n❌ Setup not done. Run "natureco setup" first.\n')));
    process.exit(1);
  }
  
  console.log(chalk.yellow(L('\n⏳ WhatsApp bağlantısı hazırlanıyor...\n', '\n⏳ Preparing WhatsApp connection...\n')));
  
  // WhatsApp için bot ID oluştur (timestamp-based)
  const botId = `whatsapp_${Date.now()}`;
  const selectedBot = { name: 'WhatsApp Bot', id: botId };
  
  console.log(chalk.cyan(L('\n📱 WhatsApp bağlantısı başlatılıyor...', '\n📱 Starting WhatsApp connection...')));
  console.log(chalk.gray(L('Telefonunuzda WhatsApp\'ı açın ve QR kodu taratın.\n', 'Open WhatsApp on your phone and scan the QR code.\n')));
  
  // Create session directory
  const sessionDir = path.join(WHATSAPP_SESSION_DIR, botId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  
  // Start connection (only for QR code)
  await startWhatsAppConnection(sessionDir, botId, selectedBot, config);
}

async function startWhatsAppConnection(sessionDir, botId, selectedBot, config) {
  try {
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = loadBaileys();
    
    // Create auth state
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    // Get latest Baileys version
    const { version } = await fetchLatestBaileysVersion();
    
    console.log(chalk.yellow(L('⏳ WhatsApp client başlatılıyor...\n', '⏳ Starting WhatsApp client...\n')));
    
    // Create socket
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      retryRequestDelayMs: 2000,
    });
    
    let qrDisplayed = false;
    let isConnected = false;
    
    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr && !qrDisplayed) {
        console.log(chalk.green(L('✅ QR kod hazır!\n', '✅ QR code ready!\n')));
        
        // Display QR code in terminal
        qrcode.generate(qr, { small: true });

        // v5.6.24: QR'i PNG olarak da kaydet, browserda ac
        try {
          const qrPngPath = path.join(sessionDir, 'qr.png');
          await QRCode.toFile(qrPngPath, qr, {
            type: 'png',
            width: 600,
            margin: 4,
            color: { dark: '#000000', light: '#FFFFFF' }
          });
          console.log(chalk.green(L('\n📸 QR PNG kaydedildi: ', '\n📸 QR PNG saved: ') + qrPngPath));
          console.log(chalk.cyan(L('🔗 Browserda acmak icin: open ', '🔗 To open in browser: open ') + qrPngPath));
        } catch (e) {
          // Sessizce gec, terminal QR yeterli
        }

        console.log('');
        console.log(chalk.gray(L('1. WhatsApp\'ı açın', '1. Open WhatsApp')));
        console.log(chalk.gray(L('2. Ayarlar > Bağlı Cihazlar > Cihaz Bağla', '2. Settings > Linked Devices > Link a Device')));
        console.log(chalk.gray(L('3. Bu QR kodu taratın\n', '3. Scan this QR code\n')));
        console.log(chalk.yellow(L('⏳ QR kod taranması bekleniyor...\n', '⏳ Waiting for QR code scan...\n')));
        
        qrDisplayed = true;
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        if (statusCode === 515 || statusCode === 408) {
          // Normal — yeniden bağlan, logout değil
          console.log(chalk.yellow(L('🔄 Yeniden bağlanıyor...', '🔄 Reconnecting...')));
          setTimeout(() => startWhatsAppConnection(sessionDir, botId, selectedBot, config), 2000);
          return;
        } else if (statusCode === 401) {
          console.log(chalk.red(L('❌ Oturum sonlandı, tekrar bağlanın.', '❌ Session ended, reconnect.')));
          process.exit(1);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log(chalk.red(L('\n❌ WhatsApp oturumu kapatıldı\n', '\n❌ WhatsApp session logged out\n')));
          process.exit(0);
        } else if (!isConnected) {
          console.log(chalk.red(L('\n❌ Bağlantı başarısız\n', '\n❌ Connection failed\n')));
          console.log(chalk.gray(`${L('Hata kodu', 'Error code')}: ${statusCode}\n`));
          process.exit(1);
        } else {
          console.log(chalk.red(`❌ ${L('Bağlantı kesildi', 'Connection lost')}: ${statusCode}\n`));
          process.exit(1);
        }
      } else if (connection === 'open') {
        isConnected = true;
        console.log(chalk.green(L('✅ WhatsApp bağlandı!\n', '✅ WhatsApp connected!\n')));
        console.log(chalk.cyan('Bot:'), chalk.white(selectedBot.name));
        console.log(chalk.cyan(L('Telefon:', 'Phone:')), chalk.white(sock.user?.id || 'Unknown'));
        console.log(chalk.gray(L('\nSession kaydedildi: ~/.natureco/whatsapp-sessions/', '\nSession saved: ~/.natureco/whatsapp-sessions/')));
        
        // Extract own number and add to allowed list
        const ownNumber = sock.user?.id?.split(':')[0].replace('@s.whatsapp.net', '') || '';
        const allowedNumbers = ownNumber ? [ownNumber] : [];
        
        // Save to config with own number in allowed list
        config.whatsappConnected = true;
        config.whatsappBotId = botId;
        config.whatsappPhone = sock.user?.id;
        config.whatsappAllowedNumbers = allowedNumbers;
        saveConfig(config);
        
        console.log(chalk.cyan('\nİzin verilen numara:'), chalk.white(`+${ownNumber} ${L('(kendi numaranız)', '(your own number)')}`));
        console.log(chalk.gray(L('Başka numara eklemek için: natureco whatsapp allow <numara>', 'To add another number: natureco whatsapp allow <number>')));
        
        console.log(chalk.green(L('\n✅ Kurulum tamamlandı!\n', '\n✅ Setup complete!\n')));
        console.log(chalk.yellow(L('Gateway ile başlatmak için:', 'To start with the gateway:')), chalk.cyan('natureco gateway start'));
        console.log(chalk.gray(L('Gateway, WhatsApp\'ı otomatik olarak başlatacak.\n', 'The gateway will start WhatsApp automatically.\n')));
        
        // Exit after setup
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      }
    });
    
    // Message handler removed - gateway handles this now
    
    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log(chalk.yellow(L('\n\n⚠️  Bağlantı iptal edildi\n', '\n\n⚠️  Connection cancelled\n')));
      process.exit(0);
    });
    
  } catch (err) {
    const msg = err instanceof NatureCoError ? err.message : err?.message ?? 'Unknown error';
    console.log(chalk.red(`\n❌ Connection failed: ${msg}\n`));
    if (err?.message?.includes('Cannot find module')) {
      console.log(chalk.yellow(L('⚠️  Baileys paketi yüklü değil. Yükleniyor...\n', '⚠️  Baileys package not installed. Installing...\n')));
      console.log(chalk.gray(L('Lütfen şu komutu çalıştırın:\n', 'Please run this command:\n')));
      console.log(chalk.cyan('npm install -g @whiskeysockets/baileys pino\n'));
    }
    process.exit(1);
  }
}

async function disconnectWhatsApp() {
  const config = getConfig();
  
  if (!config.whatsappConnected) {
    console.log(chalk.gray('\n⚠️  No WhatsApp connection found\n'));
    return;
  }
  
  process.stdin.resume();
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to disconnect WhatsApp?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  
  try {
    // Remove session directory
    const sessionDir = path.join(WHATSAPP_SESSION_DIR, config.whatsappBotId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(chalk.green(L('\n✅ Session dosyaları silindi\n', '\n✅ Session files deleted\n')));
    }
    
    // Remove from config
    delete config.whatsappConnected;
    delete config.whatsappBotId;
    delete config.whatsappPhone;
    saveConfig(config);
    
    console.log(chalk.green('✅ WhatsApp disconnected\n'));
    console.log(chalk.gray('Note: You may need to manually remove the device from WhatsApp settings.\n'));
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
  }
}

function statusWhatsApp() {
  const config = getConfig();
  
  if (!config.whatsappConnected) {
    console.log(chalk.gray('\n⚠️  WhatsApp not connected\n'));
    console.log(chalk.gray('Connect with: natureco whatsapp connect\n'));
    return;
  }
  
  console.log(chalk.green('\n✅ WhatsApp connected\n'));
  
  if (config.whatsappBotId) {
    console.log(chalk.cyan('Bot ID:'), chalk.white(config.whatsappBotId));
  }
  
  if (config.whatsappPhone) {
    console.log(chalk.cyan('Phone:'), chalk.white(config.whatsappPhone));
  }
  
  // Show allowed numbers
  const allowedNumbers = config.whatsappAllowedNumbers || [];
  if (allowedNumbers.length === 0) {
    console.log(chalk.cyan(L('İzin listesi:', 'Allowlist:')), chalk.gray(L('Boş (herkesten mesaj kabul edilir)', 'Empty (accepts messages from anyone)')));
  } else {
    console.log(chalk.cyan(L('İzin listesi:', 'Allowlist:')));
    allowedNumbers.forEach(num => console.log(chalk.white(`  - +${num}`)));
  }
  
  // Check if session files exist
  const sessionDir = path.join(WHATSAPP_SESSION_DIR, config.whatsappBotId);
  if (fs.existsSync(sessionDir)) {
    console.log(chalk.cyan('Session:'), chalk.white('Active'));
    console.log(chalk.gray(`Location: ${sessionDir}`));
  } else {
    console.log(chalk.yellow('Session:'), chalk.gray('Not found (may need to reconnect)'));
  }
  
  console.log(chalk.gray('\nDisconnect with: natureco whatsapp disconnect\n'));
}

function allowNumber(number) {
  const config = getConfig();
  
  if (!config.whatsappConnected) {
    console.log(chalk.red('\n❌ WhatsApp not connected\n'));
    console.log(chalk.gray('Connect first with: natureco whatsapp connect\n'));
    process.exit(1);
  }
  
  // Normalize number (remove +, spaces, etc.)
  const normalized = number.replace(/[\s\+\-\(\)]/g, '');
  
  if (!/^\d+$/.test(normalized)) {
    console.log(chalk.red(L('\n❌ Geçersiz numara formatı\n', '\n❌ Invalid number format\n')));
    console.log(chalk.gray(L('Örnek: natureco whatsapp allow 905551234567\n', 'Example: natureco whatsapp allow 905551234567\n')));
    process.exit(1);
  }
  
  const allowedNumbers = config.whatsappAllowedNumbers || [];
  
  if (allowedNumbers.includes(normalized)) {
    console.log(chalk.yellow(L('\n⚠️  Bu numara zaten izin listesinde\n', '\n⚠️  This number is already in the allowlist\n')));
    return;
  }
  
  allowedNumbers.push(normalized);
  config.whatsappAllowedNumbers = allowedNumbers;
  saveConfig(config);
  
  console.log(chalk.green(L('\n✅ Numara izin listesine eklendi\n', '\n✅ Number added to allowlist\n')));
  console.log(chalk.cyan(L('Numara:', 'Number:')), chalk.white(`+${normalized}`));
  console.log(chalk.cyan(L('Toplam:', 'Total:')), chalk.white(`${allowedNumbers.length} numara`));
  console.log(chalk.gray(L('\nGateway\'i yeniden başlatın: natureco gateway stop && natureco gateway start\n', '\nRestart the gateway: natureco gateway stop && natureco gateway start\n')));
}

module.exports = whatsapp;
