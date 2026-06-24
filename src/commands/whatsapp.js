const chalk = require('chalk');
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
      console.log(chalk.red('\n❌ Numara belirtmelisiniz\n'));
      console.log(chalk.gray('Kullanım: natureco whatsapp allow <numara>\n'));
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
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }
  
  console.log(chalk.yellow('\n⏳ WhatsApp bağlantısı hazırlanıyor...\n'));
  
  // WhatsApp için bot ID oluştur (timestamp-based)
  const botId = `whatsapp_${Date.now()}`;
  const selectedBot = { name: 'WhatsApp Bot', id: botId };
  
  console.log(chalk.cyan('\n📱 WhatsApp bağlantısı başlatılıyor...'));
  console.log(chalk.gray('Telefonunuzda WhatsApp\'ı açın ve QR kodu taratın.\n'));
  
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
    
    console.log(chalk.yellow('⏳ WhatsApp client başlatılıyor...\n'));
    
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
        console.log(chalk.green('✅ QR kod hazır!\n'));
        
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
          console.log(chalk.green('\n📸 QR PNG kaydedildi: ' + qrPngPath));
          console.log(chalk.cyan('🔗 Browserda acmak icin: open ' + qrPngPath));
        } catch (e) {
          // Sessizce gec, terminal QR yeterli
        }

        console.log('');
        console.log(chalk.gray('1. WhatsApp\'ı açın'));
        console.log(chalk.gray('2. Ayarlar > Bağlı Cihazlar > Cihaz Bağla'));
        console.log(chalk.gray('3. Bu QR kodu taratın\n'));
        console.log(chalk.yellow('⏳ QR kod taranması bekleniyor...\n'));
        
        qrDisplayed = true;
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        if (statusCode === 515 || statusCode === 408) {
          // Normal — yeniden bağlan, logout değil
          console.log(chalk.yellow('🔄 Yeniden bağlanıyor...'));
          setTimeout(() => startWhatsAppConnection(sessionDir, botId, selectedBot, config), 2000);
          return;
        } else if (statusCode === 401) {
          console.log(chalk.red('❌ Oturum sonlandı, tekrar bağlanın.'));
          process.exit(1);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log(chalk.red('\n❌ WhatsApp oturumu kapatıldı\n'));
          process.exit(0);
        } else if (!isConnected) {
          console.log(chalk.red('\n❌ Bağlantı başarısız\n'));
          console.log(chalk.gray(`Hata kodu: ${statusCode}\n`));
          process.exit(1);
        } else {
          console.log(chalk.red(`❌ Bağlantı kesildi: ${statusCode}\n`));
          process.exit(1);
        }
      } else if (connection === 'open') {
        isConnected = true;
        console.log(chalk.green('✅ WhatsApp bağlandı!\n'));
        console.log(chalk.cyan('Bot:'), chalk.white(selectedBot.name));
        console.log(chalk.cyan('Telefon:'), chalk.white(sock.user?.id || 'Unknown'));
        console.log(chalk.gray('\nSession kaydedildi: ~/.natureco/whatsapp-sessions/'));
        
        // Extract own number and add to allowed list
        const ownNumber = sock.user?.id?.split(':')[0].replace('@s.whatsapp.net', '') || '';
        const allowedNumbers = ownNumber ? [ownNumber] : [];
        
        // Save to config with own number in allowed list
        config.whatsappConnected = true;
        config.whatsappBotId = botId;
        config.whatsappPhone = sock.user?.id;
        config.whatsappAllowedNumbers = allowedNumbers;
        saveConfig(config);
        
        console.log(chalk.cyan('\nİzin verilen numara:'), chalk.white(`+${ownNumber} (kendi numaranız)`));
        console.log(chalk.gray('Başka numara eklemek için: natureco whatsapp allow <numara>'));
        
        console.log(chalk.green('\n✅ Kurulum tamamlandı!\n'));
        console.log(chalk.yellow('Gateway ile başlatmak için:'), chalk.cyan('natureco gateway start'));
        console.log(chalk.gray('Gateway, WhatsApp\'ı otomatik olarak başlatacak.\n'));
        
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
      console.log(chalk.yellow('\n\n⚠️  Bağlantı iptal edildi\n'));
      process.exit(0);
    });
    
  } catch (err) {
    const msg = err instanceof NatureCoError ? err.message : err?.message ?? 'Unknown error';
    console.log(chalk.red(`\n❌ Connection failed: ${msg}\n`));
    if (err?.message?.includes('Cannot find module')) {
      console.log(chalk.yellow('⚠️  Baileys paketi yüklü değil. Yükleniyor...\n'));
      console.log(chalk.gray('Lütfen şu komutu çalıştırın:\n'));
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
      console.log(chalk.green('\n✅ Session dosyaları silindi\n'));
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
    console.log(chalk.cyan('İzin listesi:'), chalk.gray('Boş (herkesten mesaj kabul edilir)'));
  } else {
    console.log(chalk.cyan('İzin listesi:'));
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
    console.log(chalk.red('\n❌ Geçersiz numara formatı\n'));
    console.log(chalk.gray('Örnek: natureco whatsapp allow 905551234567\n'));
    process.exit(1);
  }
  
  const allowedNumbers = config.whatsappAllowedNumbers || [];
  
  if (allowedNumbers.includes(normalized)) {
    console.log(chalk.yellow('\n⚠️  Bu numara zaten izin listesinde\n'));
    return;
  }
  
  allowedNumbers.push(normalized);
  config.whatsappAllowedNumbers = allowedNumbers;
  saveConfig(config);
  
  console.log(chalk.green('\n✅ Numara izin listesine eklendi\n'));
  console.log(chalk.cyan('Numara:'), chalk.white(`+${normalized}`));
  console.log(chalk.cyan('Toplam:'), chalk.white(`${allowedNumbers.length} numara`));
  console.log(chalk.gray('\nGateway\'i yeniden başlatın: natureco gateway stop && natureco gateway start\n'));
}

module.exports = whatsapp;
