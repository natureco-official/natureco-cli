const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const pino = require('pino');
const { loadBaileys } = require('../utils/baileys');
const { ApiError } = require('../utils/errors');

const PID_FILE = path.join(os.homedir(), '.natureco', 'gateway.pid');
const LOG_FILE = path.join(os.homedir(), '.natureco', 'gateway.log');

// `https` is used in the webhook delivery path (~line 570). The require was
// missing; the module only worked because Node's CommonJS cache happens to
// have it loaded from elsewhere, but in a fresh process or after a worker
// restart this would crash. Explicit.
const https = require('https');
// saveConfig (and the loaded `config` value, when not shadowed in scope)
// referenced in the Discord ready handler / Mattermost HTTP path. Same
// side-effect-global story as above.
const { saveConfig } = require('../utils/config');

/**
 * Strip a leading slash command prefix from a messaging-channel inbound.
 * v5.6.41+ added slash-prefix routing (e.g. `/ask`, `/help`, `/translate`)
 * for iMessage + WhatsApp; the Telegram/IRC/SMS handlers were referencing
 * a `cleanCommand` variable that no longer existed (3 ReferenceError sites,
 * caught by ESLint no-undef). This helper restores the missing transform:
 *   "/ask merhaba"  → "merhaba"
 *   "merhaba"       → "merhaba"
 *   "" / undefined  → ""
 */
function stripSlashPrefix(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/^\/[a-zA-Z0-9_-]+\s*/, '').trim() || text.trim();
}

// Silent logger for Baileys
const silentLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger
};

// Create Baileys logger — real pino in worker mode, silent otherwise
let _baileysLogger = null;
function getBaileysLogger() {
  if (!_baileysLogger) {
    const isWorker = process.argv.includes('--gateway-worker');
    _baileysLogger = isWorker
      ? pino({ level: 'info', transport: { target: 'pino/file', options: { destination: LOG_FILE } } })
      : silentLogger;
  }
  return _baileysLogger;
}

// Log helper - only writes to console in worker, file writing handled by stdio redirect
function log(module, message, color = 'white') {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${timestamp}] [${module}] ${message}`;
  
  // Console output with color (will be redirected to file by parent process)
  const colorFn = chalk[color] || chalk.white;
  console.log(colorFn(logLine));
  
  // Note: File writing removed - parent process redirects stdout/stderr to log file
  // This prevents duplicate log entries
}

// Number matching helper - compare last 10 digits only
function numberMatches(incoming, allowed) {
  const clean = (n) => n.replace(/\D/g, '').slice(-10);
  return clean(incoming) === clean(allowed);
}

async function gatewayServer(action) {
  // Check if running as background worker
  if (process.argv.includes('--gateway-worker')) {
    process.stdin.resume();
    process.title = 'natureco-gateway';
    log('gateway', 'Worker process started, PID: ' + process.pid);
    return runGatewayWorker();
  }
  
  if (!action || action === 'start') {
    return startGateway();
  }
  
  if (action === 'stop') {
    return stopGateway();
  }
  
  if (action === 'status') {
    return statusGateway();
  }
  
  if (action === 'logs') {
    return showLogs();
  }
  
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: start, stop, status, logs\n'));
  process.exit(1);
}

async function startGateway() {
  // Check if already running
  if (fs.existsSync(PID_FILE)) {
    const pid = fs.readFileSync(PID_FILE, 'utf-8').trim();
    try {
      process.kill(pid, 0);
      console.log(chalk.yellow('\n⚠️  Gateway already running\n'));
      console.log(chalk.gray(`PID: ${pid}`));
      console.log(chalk.gray('Stop with: natureco gateway stop\n'));
      return;
    } catch {
      // Process not running, remove stale PID file
      fs.unlinkSync(PID_FILE);
    }
  }
  
  console.log(chalk.green('\n🚀 Starting NatureCo Gateway...\n'));
  
  // Ensure log directory exists
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Open log file for stdio redirection
  const logFd = fs.openSync(LOG_FILE, 'a');
  
  // Start as detached background process
  const child = spawn(process.execPath, [require.resolve('./gateway-server'), '--gateway-worker'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    cwd: os.homedir(),
  });
  
  child.unref();
  
  // Save PID
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf-8');
  
  console.log(chalk.green('✅ Gateway started in background'));
  console.log(chalk.cyan('PID:'), chalk.white(child.pid));
  console.log(chalk.cyan('Logs:'), chalk.white(LOG_FILE));
  console.log(chalk.gray('\nView logs: natureco gateway logs'));
  console.log(chalk.gray('Check status: natureco gateway status'));
  console.log(chalk.gray('Stop gateway: natureco gateway stop\n'));
  
  process.exit(0);
}

async function runGatewayWorker() {
  // This runs in the background
  const pkg = require('../../package.json');
  log('gateway', `Starting NatureCo Gateway v${pkg.version}...`, 'green');
  
  // Load config
  const { getConfig, saveConfig } = require('../utils/config');
  const config = getConfig();
  
  if (!config || !config.providerUrl) {
    log('gateway', 'Setup yapılmamış. Run "natureco setup" first.', 'red');
    process.exit(1);
  }
  
  // Store provider instances globally for HTTP endpoint
  global.whatsappSock = null;
  global.telegramBot = null;
  global.signalProvider = null;
  
  // Start WhatsApp if configured
  if (config.whatsappConnected && config.whatsappBotId) {
    const sessionDir = path.join(os.homedir(), '.natureco', 'whatsapp-sessions', config.whatsappBotId);
    
    if (fs.existsSync(sessionDir)) {
      const phone = config.whatsappPhone?.split(':')[0].replace('@s.whatsapp.net', '') || 'unknown';
      log('whatsapp', `starting provider (+${phone})`, 'cyan');
      startWhatsAppProvider(sessionDir, config);
    } else {
      log('whatsapp', 'session not found, skipping', 'yellow');
    }
  } else {
    log('whatsapp', 'not configured, skipping', 'gray');
  }
  
  // Start Telegram if configured (v5.5.2: sadece token yeterli, botId otomatik)
  if (config.telegramToken) {
    if (!config.telegramBotId) {
      config.telegramBotId = `telegram_${Date.now()}`;
      saveConfig(config);
    }
    log('telegram', 'starting bot...', 'cyan');
    startTelegramProvider(config);
  } else {
    log('telegram', 'not configured, skipping', 'gray');
  }

  // Start Signal if configured
  if (config.signalBotId && config.signalHttpUrl) {
    log('signal', `starting provider (${config.signalAccount || config.signalHttpUrl})`, 'cyan');
    startSignalProvider(config);
  } else if (config.signalBotId) {
    log('signal', 'not configured (no HTTP URL), skipping', 'gray');
  } else {
    log('signal', 'not configured, skipping', 'gray');
  }
  // Start IRC if configured
  if (config.ircBotId && config.ircHost && config.ircNick) {
    log('irc', `connecting to ${config.ircNick} @ ${config.ircHost}:${config.ircPort}`, 'cyan');
    startIrcProvider(config);
  } else if (config.ircBotId) {
    log('irc', 'not configured (missing host or nick), skipping', 'gray');
  } else {
    log('irc', 'not configured, skipping', 'gray');
  }
  // Start Mattermost if configured
  if (config.mattermostBotId && config.mattermostBaseUrl && config.mattermostToken) {
    log('mattermost', `connecting to ${config.mattermostBaseUrl}`, 'cyan');
    startMattermostProvider(config);
  } else if (config.mattermostBotId) {
    log('mattermost', 'not configured (missing URL or token), skipping', 'gray');
  } else {
    log('mattermost', 'not configured, skipping', 'gray');
  }
  // Start iMessage if configured
  if (config.imessageBotId) {
    if (process.platform === 'darwin') {
      log('imessage', 'starting provider (macOS)', 'cyan');
      startImessageProvider(config);
    } else {
      log('imessage', 'macOS only, skipping', 'yellow');
    }
  } else {
    log('imessage', 'not configured, skipping', 'gray');
  }
  // Start SMS provider if configured
  if (config.smsBotId && config.smsAccountSid && config.smsAuthToken) {
    log('sms', `starting provider (${config.smsFromNumber || 'Messaging Service'})`, 'cyan');
    startSmsProvider(config);
  } else if (config.smsBotId) {
    log('sms', 'not configured (missing Account SID), skipping', 'gray');
  } else {
    log('sms', 'not configured, skipping', 'gray');
  }
  if (config.webhooks?.length) log('webhooks', `${config.webhooks.length} route(s) configured`, 'gray');
  
  // Start HTTP server for message sending
  startHttpServer();
  
  // Load and start cron jobs
  startCronJobs(config);
  
  // Health check every 60 seconds
  setInterval(async () => {
    const alive = fs.existsSync(PID_FILE) && (() => { try { process.kill(process.pid, 0); return true; } catch { return false; } })();
    const wsOk = global.gatewayWs && global.gatewayWs.readyState === 1;
    if (alive && wsOk) {
      log('gateway', 'health check: OK', 'gray');
    } else {
      log('gateway', `health check: WARN (alive=${alive}, ws=${wsOk})`, 'yellow');
    }
  }, 60000);
  
  log('gateway', 'Gateway running in background', 'green');
  
  // Handle shutdown
  const shutdown = () => {
    log('gateway', 'Shutting down...', 'yellow');
    if (global.signalProvider?.ws) {
      try { global.signalProvider.ws.close(); } catch {}
    }
    if (signalPollingInterval) {
      clearInterval(signalPollingInterval);
      signalPollingInterval = null;
    }
    stopIrcProvider();
    stopMattermostProvider();
    stopImessageProvider();
    stopSmsProvider();
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function startWhatsAppProvider(sessionDir, config) {
  try {
    // v5.43 GÜVENLİK: session dizini Baileys kimlik/oturum dosyalarını tutar; çalınırsa
    // WhatsApp hesabı ele geçirilebilir → ssh anahtarları gibi 0700 (parent dahil).
    try {
      const parent = path.dirname(sessionDir);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      else fs.chmodSync(parent, 0o700);
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
      else fs.chmodSync(sessionDir, 0o700);
    } catch { /* best-effort */ }
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = loadBaileys();
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    // Track last bot reply to prevent infinite loop
    let lastBotReply = '';
    
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: getBaileysLogger(),
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      retryRequestDelayMs: 2000,
    });
    
    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        // Remove all event listeners before reconnecting
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('messages.upsert');
        sock.ev.removeAllListeners('creds.update');
        
        if (statusCode === 515 || statusCode === 408) {
          log('whatsapp', 'connection lost, reconnecting in 10s...', 'yellow');
          setTimeout(() => startWhatsAppProvider(sessionDir, config), 10000);
          return;
        } else if (statusCode === 401) {
          log('whatsapp', 'session expired, please reconnect', 'red');
        } else {
          log('whatsapp', `disconnected (code: ${statusCode}), reconnecting in 10s...`, 'yellow');
          setTimeout(() => startWhatsAppProvider(sessionDir, config), 10000);
        }
      } else if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0].replace('@s.whatsapp.net', '') || 'unknown';
        log('whatsapp', `Connected successfully`, 'green');
        log('whatsapp', `Listening for inbound messages.`, 'cyan');
        log('whatsapp', `Phone: +${phone}`, 'gray');
        
        // Store socket globally for HTTP endpoint
        global.whatsappSock = sock;
      }
    });
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
      log('whatsapp', `messages.upsert event triggered, ${messages.length} message(s)`, 'gray');
      
      for (const msg of messages) {
        // Log raw message info
        log('whatsapp', `Raw message - fromMe: ${msg.key.fromMe}, remoteJid: ${msg.key.remoteJid}`, 'gray');
        
        const remoteJid = msg.key.remoteJid || '';
        const isLID = remoteJid.includes('@lid');
        
        // Skip bot's own replies (fromMe=true and not LID, or matches last bot reply)
        const messageText = msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || 
                           msg.message?.imageMessage?.caption ||
                           msg.message?.videoMessage?.caption ||
                           msg.message?.buttonsResponseMessage?.selectedDisplayText ||
                           msg.message?.listResponseMessage?.title ||
                           msg.message?.ephemeralMessage?.message?.conversation ||
                           msg.message?.viewOnceMessage?.message?.conversation ||
                           '';
        
        // Skip if this is the bot's own reply
        if (msg.key.fromMe && !isLID) {
          log('whatsapp', 'Skipping bot own reply (fromMe=true, not LID)', 'gray');
          continue;
        }
        
        // Skip if message matches last bot reply (prevent loop)
        if (messageText === lastBotReply && lastBotReply !== '') {
          log('whatsapp', 'Skipping duplicate bot reply (matches last sent)', 'gray');
          continue;
        }
        
        // Handle LID format (new WhatsApp format)
        if (isLID && !msg.key.fromMe) {
          log('whatsapp', 'LID format detected, fromMe=false, blocked', 'yellow');
          continue;
        }
        
        const sender = remoteJid.split('@')[0].split(':')[0];
        const allowedNumbers = config.whatsappAllowedNumbers || [];
        
        // Log incoming number
        log('whatsapp', `Incoming from: +${sender}, allowed: ${JSON.stringify(allowedNumbers)}`, 'gray');
        
        // Access control - skip if fromMe + LID (own conversation)
        if (!(msg.key.fromMe && isLID) && allowedNumbers.length > 0 && !allowedNumbers.some(n => numberMatches(n, sender))) {
          log('whatsapp', `blocked message from +${sender} (not in allowed list)`, 'yellow');
          continue;
        }
        
        if (!messageText) {
          log('whatsapp', `Message without text content. Keys: ${Object.keys(msg.message || {}).join(', ')}`, 'gray');
          continue;
        }

        // v5.6.43: Slash-prefix komut sistemi - sadece / ile başlayan mesajlara cevap ver
        if (!messageText.startsWith('/')) {
          log('whatsapp', `Skipping non-command from +${sender}: "${messageText.slice(0, 40)}..."`, 'gray');
          continue;
        }
        const cleanCommand = messageText.replace(/^\/+/, '').trim();
        if (!cleanCommand) {
          log('whatsapp', `Empty command from +${sender}`, 'gray');
          continue;
        }
        log('whatsapp', `Slash command: /${cleanCommand.slice(0, 60)}`, 'yellow');

        const ownNumber = sock.user?.id?.split(':')[0].replace('@s.whatsapp.net', '') || 'unknown';
        log('whatsapp', `Inbound message +${sender} -> +${ownNumber} (${cleanCommand.length} chars)`, 'cyan');
        
        try {
          // v5.47 TEK BEYIN: allow-list'teki gonderen (veya sahibin kendi cihazi) =
          // guvenilir → terminaldekiyle ayni ajan. Aksi halde hafizasiz hafif yol.
          const trusted = (msg.key.fromMe && isLID) ||
            (allowedNumbers.length > 0 && allowedNumbers.some(n => numberMatches(n, sender)));
          let reply = '';

          if (trusted) {
            log('whatsapp', 'Trusted sender → unified agent brain', 'cyan');
            const { runBrain } = require('../utils/channel-brain');
            reply = await runBrain({ channel: 'whatsapp', chatKey: sender.replace(/\D/g, ''), text: cleanCommand });
          } else {
            log('whatsapp', 'Untrusted sender → memory-less lightweight path', 'gray');
            const { sendMessage } = require('../utils/api');
            const { getConfig } = require('../utils/config');
            const cfg = getConfig();
            const systemPrompt = `You are a helpful WhatsApp assistant. Keep responses concise and friendly. Use emojis when appropriate.`;
            const response = await sendMessage(cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', cleanCommand, `whatsapp_${sender.replace(/\D/g, '')}`, systemPrompt, { noTools: true });
            reply = response?.reply || response?.message || '';
          }

          if (reply) {
            log('whatsapp', 'Sending reply...', 'cyan');

            await sock.sendMessage(msg.key.remoteJid, { text: reply });

            // Store last bot reply to prevent loop
            lastBotReply = reply;

            log('whatsapp', `Reply sent (${reply.length} chars)`, 'green');
          } else {
            log('whatsapp', 'No reply from provider', 'yellow');
          }
        } catch (err) {
          log('whatsapp', `Provider error: ${err.message}`, 'red');
        }
      }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
  } catch (err) {
    log('whatsapp', `Failed to start: ${err.message}`, 'red');
    log('whatsapp', 'Retrying in 10s...', 'yellow');
    setTimeout(() => startWhatsAppProvider(sessionDir, config), 10000);
  }
}


async function startDiscordProvider(config) {
  try {
    let Discord;
    try {
      Discord = require('discord.js');
    } catch (e) {
      log('discord', 'discord.js not installed. Run: npm install discord.js', 'red');
      return;
    }

    const { Client, GatewayIntentBits, Events } = Discord;
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ]
    });

    const botId = config.discordBotId || `discord_${Date.now()}`;
    global.discordClient = client;
    global.discordBotId = botId;

    client.once(Events.ClientReady, (c) => {
      log('discord', `bot online as ${c.user.tag}`, 'green');
      config.discordBotId = botId;
      saveConfig(config);
    });

    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      const chatId = message.channel.id;
      const allowedChats = config.discordAllowedChats || [];
      if (allowedChats.length > 0 && !allowedChats.includes(chatId)) return;

      try {
        const response = await callProviderForGateway(config, message.content, {
          chatId, userId: message.author.id, channel: 'discord'
        });
        if (response) {
          // Discord 2000 char limit
          const chunks = response.match(/.{1,1900}/gs) || [response];
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        }
      } catch (e) {
        log('discord', `error: ${e.message}`, 'red');
      }
    });

    await client.login(config.discordToken);
  } catch (e) {
    log('discord', `failed: ${e.message}`, 'red');
  }
}

// v5.43 GÜVENLİK: Slack/Signal/IRC/Mattermost'ta gönderen doğrulaması YOKTU + tüm
// kanallar paylaşımlı 'universal-provider' hafızasını system prompt'a ekliyordu →
// yetkisiz/yabancı gönderene kişisel hafıza sızabiliyordu. channelGate: (1) allow-list
// kuruluysa yetkisiz göndereni ENGELLE; (2) allow-list kurulu DEĞİLSE yanıt ver ama
// kişisel hafızayı ENJEKTE ETME (trusted=false) — böylece anonim kanaldan hafıza sızmaz.
function channelGate(config, channel, senderId) {
  const allow = config[`${channel}AllowedChats`] || config[`${channel}AllowedNumbers`] || config[`${channel}AllowedUsers`] || [];
  if (!Array.isArray(allow) || allow.length === 0) {
    return { allowed: true, trusted: false };
  }
  const ok = allow.map(String).includes(String(senderId));
  return { allowed: ok, trusted: ok };
}

async function startSlackProvider(config) {
  try {
    const { WebClient } = require('@slack/web-api');
    const client = new WebClient(config.slackToken);

    const botId = config.slackBotId || `slack_${Date.now()}`;
    global.slackClient = client;
    global.slackBotId = botId;

    const authResult = await client.auth.test();
    log('slack', `bot online as ${authResult.user}`, 'green');
    config.slackBotId = botId;
    saveConfig(config);

    // Slack RTM veya events API kullan
    // Not: Tam real-time icin Bolt framework gerekli, su an basit polling
    log('slack', 'polling mode active (use Bolt SDK for real-time)', 'gray');
  } catch (e) {
    log('slack', `failed: ${e.message}`, 'red');
  }
}

async function callProviderForGateway(config, message, context) {
  // Gateway icin LLM API cagir
  // v5.6.43: System prompt ekle - MiniMax bazen sadece user mesajiyla hata veriyor
  const apiMessages = [
    { role: 'system', content: 'You are a helpful AI assistant. Respond concisely.' },
    { role: 'user', content: message }
  ];
  return new Promise((resolve, reject) => {
    const providerUrl = config.providerUrl;
    const providerApiKey = config.providerApiKey;
    const model = config.providerModel;

    const isMM = providerUrl && (providerUrl.includes('minimax') || providerUrl.includes('minimaxi'));
    // v5.6.43: Endpoint duzeltme - MiniMax icin farkli yol dene
    let endpoint;
    if (isMM) {
      const base = providerUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
      endpoint = `${base}/v1/text/chatcompletion_v2`;
    } else {
      endpoint = `${providerUrl.replace(/\/+$/, '')}/chat/completions`;
    }

    const data = JSON.stringify({
      model, messages: apiMessages, temperature: 0.7, max_tokens: 2048
    });

    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${providerApiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const reply = parsed.choices?.[0]?.message?.content;
          resolve(reply || 'Cevap uretilemedi');
        } catch (e) {
          reject(new Error('Parse hatasi: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy());
    req.write(data);
    req.end();
  });
}

async function startTelegramProvider(config) {
  try {
    // Lazy load node-telegram-bot-api
    let TelegramBot;
    try {
      TelegramBot = require('node-telegram-bot-api');
    } catch (err) {
      log('telegram', 'node-telegram-bot-api not installed', 'red');
      log('telegram', 'Install with: npm install -g node-telegram-bot-api', 'yellow');
      return;
    }
    
    const bot = new TelegramBot(config.telegramToken, { polling: true });
    
    log('telegram', 'Bot started successfully', 'green');
    log('telegram', 'Listening for messages...', 'cyan');
    
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const messageText = msg.text;
      
      if (!messageText) {
        log('telegram', `Message without text from chat ${chatId}`, 'gray');
        return;
      }
      
      // v5.47 TEK BEYIN: gonderen dogrulamasi channelGate ile (ayni semantik: allow-list
      // doluysa disindakiler engellenir; bos ise herkes yanit alir ama guvenilmez sayilir).
      const gate = channelGate(config, 'telegram', String(chatId));
      if (!gate.allowed) {
        log('telegram', `Blocked message from chat ${chatId} (not in allowed list)`, 'yellow');
        return;
      }

      log('telegram', `Inbound message from chat ${chatId} (${messageText.length} chars)`, 'cyan');

      try {
        const cleanCommand = stripSlashPrefix(messageText);
        let reply = '';

        if (gate.trusted) {
          // Sahip: terminaldekiyle AYNI ajan — ayni persona, ayni kalici hafiza, ayni araclar
          log('telegram', 'Trusted sender → unified agent brain', 'cyan');
          const { runBrain } = require('../utils/channel-brain');
          reply = await runBrain({ channel: 'telegram', chatKey: String(chatId), text: cleanCommand });
        } else {
          // Guvenilmeyen gonderen: hafizasiz + aracsiz hafif yol (v5.43 kurali)
          log('telegram', 'Untrusted sender → memory-less lightweight path', 'gray');
          const { sendMessage } = require('../utils/api');
          const { getConfig } = require('../utils/config');
          const cfg = getConfig();
          const systemPrompt = `You are a helpful Telegram assistant. Keep responses concise and friendly. Use emojis when appropriate.`;
          const response = await sendMessage(cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', cleanCommand, `telegram_${chatId}`, systemPrompt, { noTools: true });
          reply = response?.reply || response?.message || '';
        }

        if (reply) {
          log('telegram', 'Sending reply...', 'cyan');

          // Telegram mesaj limiti 4096 — uzun yaniti parcalara bol
          const { chunkText } = require('../utils/channel-brain');
          for (const part of chunkText(reply, 4000)) {
            await bot.sendMessage(chatId, part);
          }

          log('telegram', `Reply sent (${reply.length} chars)`, 'green');
        } else {
          log('telegram', 'No reply from provider', 'yellow');
        }
      } catch (err) {
        log('telegram', `Provider error: ${err.message}`, 'red');
        
        // Send error message to user
        try {
          await bot.sendMessage(chatId, '❌ Bir hata oluştu. Lütfen tekrar deneyin.');
        } catch (sendErr) {
          log('telegram', `Failed to send error message: ${sendErr.message}`, 'red');
        }
      }
    });
    
    bot.on('polling_error', (error) => {
      log('telegram', `Polling error: ${error.message}`, 'red');
    });
    
    // Store bot globally for HTTP endpoint
    global.telegramBot = bot;
    
  } catch (err) {
    log('telegram', `Failed to start: ${err.message}`, 'red');
  }
}

async function startSignalProvider(config) {
  const baseUrl = config.signalHttpUrl;
  const account = config.signalAccount;
  const mode = config.signalApiMode || 'auto';

  // Detect API mode
  let detectedMode = mode;
  if (mode === 'auto') {
    try {
      const nativeRes = await fetch(`${baseUrl}/api/v1/check`, { signal: AbortSignal.timeout(5000) });
      if (nativeRes.ok) {
        detectedMode = 'native';
        log('signal', 'detected native JSON-RPC API', 'gray');
      }
    } catch {}
    if (detectedMode === 'auto') {
      try {
        const containerRes = await fetch(`${baseUrl}/v1/about`, { signal: AbortSignal.timeout(5000) });
        if (containerRes.ok) {
          detectedMode = 'container';
          log('signal', 'detected container REST API', 'gray');
        }
      } catch {}
    }
    if (detectedMode === 'auto') {
      log('signal', 'API not reachable, will retry', 'yellow');
    }
  }

  if (detectedMode === 'auto' || detectedMode === 'none') {
    log('signal', 'API unreachable, will start daemon on demand', 'gray');
    return;
  }

  global.signalProvider = { baseUrl, account, mode: detectedMode };

  // Start event stream for incoming messages (native mode uses SSE)
  if (detectedMode === 'native') {
    startSignalEventStream(baseUrl, account, config);
  } else if (detectedMode === 'container') {
    startSignalWebSocket(baseUrl, account, config);
  }

  log('signal', 'provider ready', 'green');
}

async function startSignalEventStream(baseUrl, account, config) {
  const eventsUrl = `${baseUrl}/api/v1/events?account=${encodeURIComponent(account)}`;

  const connect = async () => {
    try {
      const response = await fetch(eventsUrl, {
        signal: AbortSignal.timeout(300000),
        headers: { 'Accept': 'text/event-stream' },
      });

      if (!response.ok) {
        throw new Error(`SSE HTTP ${response.status}`);
      }

      log('signal', 'SSE event stream connected', 'cyan');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6).trim();
          } else if (line === '' && eventData) {
            processSignalEvent(eventType, eventData, config);
            eventType = '';
            eventData = '';
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        log('signal', 'SSE stream timeout, reconnecting...', 'yellow');
      } else {
        log('signal', `SSE error: ${err.message}, reconnecting in 10s...`, 'yellow');
      }
    }

    setTimeout(connect, 10000);
  };

  connect();
}

async function startSignalWebSocket(baseUrl, account, config) {
  const wsUrl = baseUrl.replace(/^http/, 'ws') + `/v1/receive/${encodeURIComponent(account)}`;

  const connect = async () => {
    try {
      let WebSocket;
      try {
        WebSocket = require('ws');
      } catch {
        log('signal', 'ws module not available, falling back to polling', 'yellow');
        startSignalPolling(baseUrl, account, config);
        return;
      }

      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        log('signal', 'WebSocket event stream connected', 'cyan');
      });

      ws.on('message', (data) => {
        try {
          const envelope = JSON.parse(data.toString());
          processSignalEnvelope(envelope, config);
        } catch (err) {
          log('signal', `Failed to parse WS message: ${err.message}`, 'red');
        }
      });

      ws.on('close', (code) => {
        log('signal', `WebSocket closed (code ${code}), reconnecting in 10s...`, 'yellow');
        setTimeout(connect, 10000);
      });

      ws.on('error', (err) => {
        log('signal', `WebSocket error: ${err.message}`, 'red');
        ws.close();
      });

      global.signalProvider.ws = ws;

    } catch (err) {
      log('signal', `WebSocket failed: ${err.message}, retrying in 10s...`, 'yellow');
      setTimeout(connect, 10000);
    }
  };

  connect();
}

// Fallback polling for container mode when ws is not available
let signalPollingInterval = null;
function startSignalPolling(baseUrl, account, config) {
  if (signalPollingInterval) return;
  log('signal', 'starting polling fallback (30s interval)', 'gray');
  signalPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${baseUrl}/v1/receive/${encodeURIComponent(account)}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const envelopes = await res.json();
        if (Array.isArray(envelopes)) {
          for (const envelope of envelopes) {
            processSignalEnvelope(envelope, config);
          }
        }
      }
    } catch {}
  }, 30000);
}

async function processSignalEvent(eventType, eventData, config) {
  try {
    const data = JSON.parse(eventData);
    if (data.envelope) {
      processSignalEnvelope(data.envelope, config);
    }
  } catch (err) {
    log('signal', `Event parse error: ${err.message}`, 'red');
  }
}

async function processSignalEnvelope(envelope, config) {
  try {
    const dataMessage = envelope.dataMessage || envelope.syncMessage?.sent?.message;
    if (!dataMessage) return;

    const sender = envelope.sourceUuid || envelope.sourceNumber || envelope.sourceName;
    if (!sender) return;

    // Skip self-messages
    if (envelope.sourceNumber === config.signalAccount) return;

    const messageText = dataMessage.message || '';
    if (!messageText.trim()) return;

    log('signal', `Inbound from ${sender}: "${messageText.slice(0, 80)}"`, 'cyan');

    // Check DM policy
    const dmPolicy = config.signalDmPolicy || 'pairing';
    if (dmPolicy === 'disabled') return;

    // v5.43 GÜVENLİK: gönderen doğrulaması + hafıza sızıntısı önleme
    const gate = channelGate(config, 'signal', sender);
    if (!gate.allowed) { log('signal', `Blocked (allow-list): ${sender}`, 'yellow'); return; }

    // Get AI response
    try {
      // v5.47 TEK BEYIN: guvenilir gonderen terminaldekiyle ayni ajani kullanir
      let reply = '';
      if (gate.trusted) {
        const { runBrain } = require('../utils/channel-brain');
        reply = await runBrain({ channel: 'signal', chatKey: sender, text: messageText });
      } else {
        const { sendMessage } = require('../utils/api');
        const { getConfig } = require('../utils/config');
        const cfg = getConfig();
        const systemPrompt = `You are a helpful Signal assistant. Keep responses concise.`;
        const response = await sendMessage(
          cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', messageText,
          `signal_${sender}`, systemPrompt, { noTools: true }
        );
        reply = response?.reply || response?.message || '';
      }

      if (reply) {
        await sendSignalMessage(config, sender, reply);
        log('signal', `Reply sent to ${sender} (${reply.length} chars)`, 'green');
      }
    } catch (err) {
      log('signal', `Response error: ${err.message}`, 'red');
    }
  } catch (err) {
    log('signal', `Envelope error: ${err.message}`, 'red');
  }
}

async function sendSignalMessage(config, recipient, message) {
  const baseUrl = config.signalHttpUrl;
  const account = config.signalAccount;
  const mode = config.signalApiMode || 'auto';

  if (mode === 'native' || mode === 'auto') {
    // Try native JSON-RPC first
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'send',
      params: {
        recipient: [recipient],
        message,
        account,
      },
      id: Date.now(),
    };

    try {
      const res = await fetch(`${baseUrl}/api/v1/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcPayload),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return;
    } catch {}
  }

  // Fallback to container mode
  const containerPayload = {
    message,
    number: account,
    recipients: [recipient],
    text_mode: 'normal',
  };

  const res = await fetch(`${baseUrl}/v2/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerPayload),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Signal send failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

// IRC provider
let ircClient = null;
let ircReconnectTimer = null;

async function startIrcProvider(config) {
  if (ircClient) {
    log('irc', 'already connected', 'yellow');
    return;
  }

  const net = require('net');
  const tls = require('tls');

  const host = config.ircHost;
  const port = config.ircPort || 6697;
  const useTls = config.ircTls !== false;
  const nick = config.ircNick;
  const username = config.ircUsername || nick;
  const realname = config.ircRealname || 'NatureCo';
  const password = config.ircPassword || '';
  const channels = config.ircChannels || [];
  const nickservEnabled = config.ircNickservEnabled !== false;
  const nickservPassword = config.ircNickservPassword || '';

  let buffer = '';
  let currentNick = nick;
  let registered = false;
  let quitRequested = false;

  const connect = () => {
    if (quitRequested) return;

    registered = false;
    const socket = useTls
      ? tls.connect({ host, port, servername: host })
      : net.createConnection({ host, port });

    socket.setEncoding('utf8');

    const sendRaw = (line) => {
      socket.write(line + '\r\n');
    };

    socket.once('connect', () => {
      log('irc', `connected to ${host}:${port}`, 'green');
      if (password) sendRaw(`PASS ${password}`);
      sendRaw(`NICK ${currentNick}`);
      sendRaw(`USER ${username} 0 * :${realname}`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // PING handler
        if (line.startsWith('PING ')) {
          sendRaw('PONG ' + line.slice(5));
          continue;
        }

        // Parse IRC message
        const parsed = parseIrcLine(line);
        if (!parsed) continue;

        // Track nick changes
        if (parsed.command === 'NICK' && parsed.prefixNick === currentNick) {
          currentNick = parsed.trailing || parsed.params[0];
        }

        // Welcome — server ready
        if (parsed.command === '001') {
          registered = true;
          log('irc', `registered as ${currentNick}`, 'cyan');

          // NickServ auth
          if (nickservEnabled && nickservPassword) {
            sendRaw(`PRIVMSG NickServ :IDENTIFY ${nickservPassword}`);
            log('irc', 'NickServ IDENTIFY sent', 'gray');
          }

          // Join channels
          for (const ch of channels) {
            sendRaw(`JOIN ${ch.startsWith('#') ? ch : '#' + ch}`);
            log('irc', `joining ${ch.startsWith('#') ? ch : '#' + ch}`, 'gray');
          }

          global.ircClient = { sendRaw, isReady: () => registered };
          continue;
        }

        // Handle PRIVMSG (incoming messages)
        if (parsed.command === 'PRIVMSG' && registered) {
          const senderNick = parsed.prefixNick;
          if (senderNick === currentNick) continue; // skip self

          const target = parsed.params[0];
          const text = parsed.trailing || '';

          if (!text.trim()) continue;

          const isChannel = target.startsWith('#');
          log('irc', `${isChannel ? target : senderNick}: ${text.slice(0, 100)}`, 'cyan');

          // In DM or channel message with mention
          const isDirect = !isChannel;
          if (!isDirect && !text.toLowerCase().includes(currentNick.toLowerCase())) continue;

          processIrcMessage(config, senderNick, target, text, socket);
        }
      }
    });

    socket.on('close', () => {
      global.ircClient = null;
      if (!quitRequested) {
        log('irc', 'connection lost, reconnecting in 10s...', 'yellow');
        ircReconnectTimer = setTimeout(connect, 10000);
      }
    });

    socket.on('error', (err) => {
      log('irc', `socket error: ${err.message}`, 'red');
    });

    ircClient = socket;
  };

  connect();
}
function parseIrcLine(line) {
  const result = { raw: line, prefix: null, prefixNick: null, command: '', params: [], trailing: '' };
  let rest = line;

  if (rest.startsWith(':')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) return null;
    result.prefix = rest.slice(1, spaceIdx);
    const bangIdx = result.prefix.indexOf('!');
    result.prefixNick = bangIdx !== -1 ? result.prefix.slice(0, bangIdx) : result.prefix;
    rest = rest.slice(spaceIdx + 1);
  }

  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx === -1) {
    result.command = rest;
    return result;
  }
  result.command = rest.slice(0, spaceIdx);
  rest = rest.slice(spaceIdx + 1);

  // Trailing
  const trailIdx = rest.indexOf(' :');
  if (trailIdx !== -1) {
    result.trailing = rest.slice(trailIdx + 2);
    rest = rest.slice(0, trailIdx);
  }

  result.params = rest.split(' ').filter(Boolean);
  return result;
}

async function processIrcMessage(config, sender, target, text, socket) {
  // v5.43 GÜVENLİK: gönderen doğrulaması + hafıza sızıntısı önleme
  const gate = channelGate(config, 'irc', sender);
  if (!gate.allowed) { log('irc', `Blocked (allow-list): ${sender}`, 'yellow'); return; }
  try {
    // IRC handler's parameter is `text` (see signature above), not `messageText`.
    const cleanCommand = stripSlashPrefix(text);

    // v5.47 TEK BEYIN: guvenilir gonderen terminaldekiyle ayni ajani kullanir
    let reply = '';
    if (gate.trusted) {
      const { runBrain } = require('../utils/channel-brain');
      reply = await runBrain({ channel: 'irc', chatKey: `${sender}_${target}`, text: cleanCommand });
    } else {
      const { sendMessage } = require('../utils/api');
      const { getConfig } = require('../utils/config');
      const cfg = getConfig();
      const systemPrompt = `You are a helpful IRC assistant. Keep responses concise. Use IRC-friendly formatting.`;
      const response = await sendMessage(
        cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', cleanCommand,
        `irc_${sender}_${target}`, systemPrompt, { noTools: true }
      );
      reply = response?.reply || response?.message || '';
    }

    if (reply) {
      const ircTarget = target.startsWith('#') ? target : sender;
      sendIrcMessage(socket, ircTarget, reply);
      log('irc', `Reply sent to ${ircTarget} (${reply.length} chars)`, 'green');
    }
  } catch (err) {
    log('irc', `Response error: ${err.message}`, 'red');
  }
}

function sendIrcMessage(socket, target, text) {
  if (!socket) return;
  const maxLen = 400;
  const lines = text.split('\n');
  for (const line of lines) {
    const cleanLine = line.replace(/\r/g, '').trim();
    if (!cleanLine) continue;
    if (cleanLine.length <= maxLen) {
      socket.write(`PRIVMSG ${target} :${cleanLine}\r\n`);
    } else {
      const words = cleanLine.split(' ');
      let chunk = '';
      for (const word of words) {
        if (chunk.length + word.length + 1 > maxLen) {
          socket.write(`PRIVMSG ${target} :${chunk}\r\n`);
          chunk = word;
        } else {
          chunk = chunk ? chunk + ' ' + word : word;
        }
      }
      if (chunk) socket.write(`PRIVMSG ${target} :${chunk}\r\n`);
    }
  }
}

function stopIrcProvider() {
  if (ircReconnectTimer) {
    clearTimeout(ircReconnectTimer);
    ircReconnectTimer = null;
  }
  if (ircClient) {
    try {
      ircClient.write('QUIT :Gateway shutting down\r\n');
      ircClient.end();
    } catch {}
    ircClient = null;
  }
  global.ircClient = null;
}

// Mattermost provider
let mattermostWs = null;
let mattermostReconnectTimer = null;

async function startMattermostProvider(config) {
  const baseUrl = config.mattermostBaseUrl.replace(/\/+$/, '');
  const token = config.mattermostToken;

  // Fetch bot user info
  try {
    const meRes = await fetch(`${baseUrl}/api/v4/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!meRes.ok) {
      log('mattermost', `API auth failed (HTTP ${meRes.status})`, 'red');
      return;
    }
    const me = await meRes.json();
    log('mattermost', `authenticated as @${me.username} (${me.id})`, 'green');

    global.mattermostProvider = { baseUrl, token, userId: me.id, username: me.username };

    // Connect WebSocket for real-time events
    connectMattermostWebSocket(baseUrl, token, config);

  } catch (err) {
    log('mattermost', `connection failed: ${err.message}`, 'red');
  }
}

function connectMattermostWebSocket(baseUrl, token, config) {
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/v4/websocket';

  const connect = () => {
    try {
      let WebSocket;
      try {
        WebSocket = require('ws');
      } catch {
        log('mattermost', 'ws module not available', 'yellow');
        return;
      }

      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        log('mattermost', 'WebSocket connected', 'cyan');

        // Authenticate
        ws.send(JSON.stringify({
          seq: 1,
          action: 'authentication_challenge',
          data: { token },
        }));
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.event === 'posted') {
            handleMattermostPost(msg.data, msg.broadcast, config);
          } else if (msg.event === 'hello') {
            log('mattermost', 'WebSocket authenticated', 'green');
          } else if (msg.event === 'user_added' || msg.event === 'user_removed') {
            // no-op
          }
        } catch (err) {
          log('mattermost', `message parse error: ${err.message}`, 'red');
        }
      });

      ws.on('close', (code) => {
        log('mattermost', `WebSocket closed (code ${code})`, 'yellow');
        mattermostWs = null;
        mattermostReconnectTimer = setTimeout(connect, 10000);
      });

      ws.on('error', (err) => {
        log('mattermost', `WebSocket error: ${err.message}`, 'red');
        ws.close();
      });

      mattermostWs = ws;

    } catch (err) {
      log('mattermost', `WebSocket connect failed: ${err.message}`, 'red');
      mattermostReconnectTimer = setTimeout(connect, 30000);
    }
  };

  connect();
}

async function handleMattermostPost(data, broadcast, config) {
  try {
    if (!data?.post) return;
    const post = typeof data.post === 'string' ? JSON.parse(data.post) : data.post;

    // Skip bot's own messages
    if (post.user_id === global.mattermostProvider?.userId) return;

    const channelId = broadcast?.channel_id || post.channel_id;
    if (!channelId) return;

    const messageText = post.message || '';
    if (!messageText.trim()) return;

    const senderId = post.user_id;
    log('mattermost', `Inbound from user ${senderId}: "${messageText.slice(0, 80)}"`, 'cyan');

    // Skip system messages
    if (post.props?.from_webhook) return;

    // v5.43 GÜVENLİK: gönderen doğrulaması + hafıza sızıntısı önleme
    const gate = channelGate(config, 'mattermost', senderId);
    if (!gate.allowed) { log('mattermost', `Blocked (allow-list): ${senderId}`, 'yellow'); return; }

    // Get AI response — v5.47 TEK BEYIN: guvenilir gonderen ayni ajani kullanir
    let reply = '';
    if (gate.trusted) {
      const { runBrain } = require('../utils/channel-brain');
      reply = await runBrain({ channel: 'mattermost', chatKey: String(channelId), text: messageText });
    } else {
      const { sendMessage } = require('../utils/api');
      const { getConfig } = require('../utils/config');
      const cfg = getConfig();
      const systemPrompt = `You are a helpful Mattermost assistant. Keep responses concise.`;
      const response = await sendMessage(
        cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', messageText,
        `mattermost_${channelId}`, systemPrompt, { noTools: true }
      );
      reply = response?.reply || response?.message || '';
    }

    if (reply) {
      await sendMattermostMessage(config, channelId, reply);
      log('mattermost', `Reply sent to channel ${channelId} (${reply.length} chars)`, 'green');
    }
  } catch (err) {
    log('mattermost', `Post error: ${err.message}`, 'red');
  }
}

async function sendMattermostMessage(config, channelId, message) {
  const baseUrl = config.mattermostBaseUrl.replace(/\/+$/, '');
  const token = config.mattermostToken;

  const res = await fetch(`${baseUrl}/api/v4/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel_id: channelId,
      message,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mattermost send failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

function stopMattermostProvider() {
  if (mattermostReconnectTimer) {
    clearTimeout(mattermostReconnectTimer);
    mattermostReconnectTimer = null;
  }
  if (mattermostWs) {
    try { mattermostWs.close(); } catch {}
    mattermostWs = null;
  }
  global.mattermostProvider = null;
}

// iMessage provider
let imessagePollInterval = null;
let imessageLastMessageId = null;

async function startImessageProvider(config) {
  const imsgPath = config.imessageCliPath || findImsgBin();
  if (!imsgPath || !fs.existsSync(imsgPath)) {
    log('imessage', 'imsg binary not found, install with: brew install mbilker/imsg/imsg', 'red');
    return;
  }

  log('imessage', `using imsg: ${imsgPath}`, 'gray');
  global.imessageProvider = { imsgPath };

  // v5.6.28: imsg 0.11.1'de 'messages' komutu YOK, 'watch' kullan
  // watch komutu stream olarak yeni mesajlari verir (JSONL formati)
  try {
    const watch = spawn(imsgPath, ['watch', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    watch.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          processImessageMessage(msg, config);
        } catch {}
      }
    });

    watch.stderr.on('data', (data) => {
      // Hata logla ama durdurma
      // log('imessage', `watch stderr: ${data.toString().trim()}`, 'yellow');
    });

    watch.on('error', (e) => {
      log('imessage', `watch error: ${e.message}, falling back to history polling`, 'yellow');
      startImessagePollingFallback(imsgPath, config);
    });

    watch.on('exit', (code) => {
      log('imessage', `watch exited with code ${code}, restarting in 5s`, 'yellow');
      setTimeout(() => startImessageProvider(config), 5000);
    });

    global.imessageProvider.watch = watch;
    log('imessage', 'watching for new messages (streaming)', 'green');
  } catch (e) {
    log('imessage', `failed to start watch: ${e.message}, using polling`, 'yellow');
    startImessagePollingFallback(imsgPath, config);
  }
}

function startImessagePollingFallback(imsgPath, config) {
  // Fallback: history ile polling
  let lastRowId = null;

  imessagePollInterval = setInterval(async () => {
    try {
      const args = ['history', '--format', 'json', '--limit', '10'];
      if (lastRowId) args.push('--since-rowid', String(lastRowId));
      const result = execSync(`"${imsgPath}" ${args.join(' ')} 2>/dev/null`, {
        encoding: 'utf-8', timeout: 10000, stdio: 'pipe',
      });
      const lines = result.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id && (!lastRowId || msg.id > lastRowId)) {
            lastRowId = msg.id;
          }
          processImessageMessage(msg, config);
        } catch {}
      }
    } catch {}
  }, 15000);

  log('imessage', 'polling started (15s interval, history fallback)', 'green');
}

function findImsgBin() {
  const config = require('../utils/config').getConfig();
  if (config.imessageCliPath && fs.existsSync(config.imessageCliPath)) return config.imessageCliPath;
  try {
    const result = execSync('which imsg 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const p = result.trim();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null;
}

// Track recent outgoing messages to prevent loops
const recentOutgoingMessages = new Map(); // sender -> [{text, timestamp}, ...]

async function processImessageMessage(msg, config) {
  try {
    // Deduplicate
    if (msg.id && msg.id === imessageLastMessageId) return;
    if (msg.id) imessageLastMessageId = msg.id;

    // v5.6.39: Skip outgoing messages - TÜM olası field adlarını kontrol et
    if (msg.is_from_me || msg.isFromMe || msg.from_me || msg.fromMe) {
      log('imessage', `Skipping own message (is_from_me=true)`, 'gray');
      return;
    }

    const sender = msg.sender || msg.from || msg.address || msg.handle || '';
    const text = msg.text || msg.message || msg.body || '';

    if (!text.trim() || !sender) return;
    if (sender === 'me' || sender === 'self') return;

    // v5.6.40: Loop prevention - son gönderdiğimiz mesajla aynıysa skip
    const recentOut = recentOutgoingMessages.get(sender) || [];
    const now = Date.now();
    // 30 saniye içinde aynı mesajı gönderdiysek, bu bize gelen mesaj değil (echo)
    const isEcho = recentOut.some(m =>
      m.text === text && (now - m.timestamp) < 30000
    );
    if (isEcho) {
      log('imessage', `Skipping echo of our own message to ${sender}`, 'gray');
      return;
    }

    log('imessage', `Inbound from ${sender}: "${text.slice(0, 80)}"`, 'cyan');

    // v5.6.41: Slash-prefix komut sistemi - sadece / ile başlayan mesajlara cevap ver
    if (!text.startsWith('/')) {
      log('imessage', `Skipping non-command from ${sender}: "${text.slice(0, 40)}..."`, 'gray');
      return;
    }
    // / prefix'i kaldır
    const cleanCommand = text.replace(/^\/+/, '').trim();
    if (!cleanCommand) {
      log('imessage', `Empty command from ${sender}`, 'gray');
      return;
    }
    log('imessage', `Slash command: /${cleanCommand.slice(0, 60)}`, 'yellow');

    const { getConfig } = require('../utils/config');
    const cfg = getConfig();

    // v5.43 GÜVENLİK: gönderen doğrulaması + hafıza sızıntısı önleme
    const gate = channelGate(cfg, 'imessage', sender);
    if (!gate.allowed) { log('imessage', `Blocked (allow-list): ${sender}`, 'yellow'); return; }

    // v5.47 TEK BEYIN: guvenilir gonderen terminaldekiyle ayni ajani kullanir
    let reply = '';
    if (gate.trusted) {
      const { runBrain } = require('../utils/channel-brain');
      reply = await runBrain({ channel: 'imessage', chatKey: sender, text: cleanCommand });
    } else {
      const { sendMessage } = require('../utils/api');
      const systemPrompt = `You are a helpful iMessage assistant. Keep responses concise.`;
      const response = await sendMessage(
        cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', cleanCommand,
        `imessage_${sender}`, systemPrompt, { noTools: true }
      );
      reply = response?.reply || response?.message || '';
    }

    if (reply) {
      execSync(`${global.imessageProvider.imsgPath} send --to "${sender}" --text "${reply.replace(/"/g, '\\"')}" 2>/dev/null`, {
        timeout: 15000, stdio: 'pipe',
      });
      log('imessage', `Reply sent to ${sender} (${reply.length} chars)`, 'green');

      // v5.6.40: Track outgoing message for loop prevention
      const senderHistory = recentOutgoingMessages.get(sender) || [];
      senderHistory.push({ text: reply, timestamp: Date.now() });
      // Keep only last 5 messages
      if (senderHistory.length > 5) senderHistory.shift();
      recentOutgoingMessages.set(sender, senderHistory);
    }
  } catch (err) {
    log('imessage', `Message error: ${err.message}`, 'red');
  }
}

function stopImessageProvider() {
  if (imessagePollInterval) {
    clearInterval(imessagePollInterval);
    imessagePollInterval = null;
  }
  global.imessageProvider = null;
}

// SMS (Twilio) provider
let smsReplayCache = new Map();
const SMS_RATE_LIMIT_WINDOW = 60000;
const SMS_RATE_LIMIT_MAX = 30;
const smsRateLimitMap = new Map();

async function startSmsProvider(config) {
  log('sms', 'provider initialized for outbound sending', 'green');

  if (config.smsEnableWebhook !== false) {
    log('sms', 'webhook endpoint will be registered on HTTP server', 'gray');
  }

  global.smsProvider = {
    accountSid: config.smsAccountSid,
    authToken: config.smsAuthToken,
    fromNumber: config.smsFromNumber,
    messagingServiceSid: config.smsMessagingServiceSid || null,
  };
}

async function sendSmsMessage(config, to, message) {
  const accountSid = config.smsAccountSid;
  const authToken = config.smsAuthToken;
  const from = config.smsFromNumber;
  const messagingServiceSid = config.smsMessagingServiceSid;

  const base64Auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const body = new URLSearchParams();
  if (messagingServiceSid) {
    body.append('MessagingServiceSid', messagingServiceSid);
  } else {
    body.append('From', from);
  }
  body.append('To', to);
  body.append('Body', message);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${base64Auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 300);
    try {
      const errJson = JSON.parse(text);
      detail = errJson.message || detail;
    } catch {}
    throw new Error(`Twilio send failed (HTTP ${res.status}): ${detail}`);
  }

  return res.json();
}

function verifyTwilioSignature(authToken, url, params, signature) {
  const crypto = require('crypto');
  // Sort params by key
  const sorted = Object.keys(params).sort();
  const data = url + sorted.map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function handleSmsWebhook(config, body, req) {
  // Rate limiting
  const ip = req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowKey = `${ip}:${Math.floor(now / SMS_RATE_LIMIT_WINDOW)}`;
  const count = (smsRateLimitMap.get(windowKey) || 0) + 1;
  smsRateLimitMap.set(windowKey, count);
  if (count > SMS_RATE_LIMIT_MAX) {
    return { status: 429, body: { error: 'Too many requests' } };
  }

  // Replay protection
  const messageSid = body.MessageSid || '';
  if (messageSid && smsReplayCache.has(messageSid)) {
    return { status: 200, body: { ok: true, cached: true } };
  }
  if (messageSid) {
    smsReplayCache.set(messageSid, true);
    setTimeout(() => smsReplayCache.delete(messageSid), 600000);
    if (smsReplayCache.size > 10000) {
      const keys = [...smsReplayCache.keys()].slice(0, 2000);
      keys.forEach(k => smsReplayCache.delete(k));
    }
  }

  // Signature validation
  const signature = req.headers['x-twilio-signature'] || '';
  if (signature && config.smsAuthToken) {
    const fullUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}${req.url}`;
    const params = {};
    for (const [k, v] of Object.entries(body)) {
      params[k] = String(v);
    }
    if (!verifyTwilioSignature(config.smsAuthToken, fullUrl, params, signature)) {
      log('sms', 'invalid Twilio signature, rejecting', 'red');
      return { status: 403, body: { error: 'Invalid signature' } };
    }
  }

  const from = body.From || '';
  const to = body.To || '';
  const text = body.Body || '';

  if (!from || !text.trim()) {
    return { status: 200, body: { ok: true, ignored: true } };
  }

  log('sms', `Inbound from ${from}: "${text.slice(0, 80)}"`, 'cyan');

  // Check DM policy
  const dmPolicy = config.smsDmPolicy || 'allowlist';
  if (dmPolicy === 'disabled') {
    return { status: 200, body: { ok: true, ignored: true } };
  }

  // Get AI response
  try {
    // v5.43 GÜVENLİK: gönderen doğrulaması + hafıza sızıntısı önleme
    const gate = channelGate(config, 'sms', from);
    if (!gate.allowed) return { status: 200, body: { ok: true, blocked: true } };

    // SMS handler binds the inbound to `text` (Twilio webhook body), unlike
    // Telegram/IRC which use `messageText`.
    const cleanCommand = stripSlashPrefix(text);

    // v5.47 TEK BEYIN: guvenilir gonderen terminaldekiyle ayni ajani kullanir
    let reply = '';
    if (gate.trusted) {
      const { runBrain } = require('../utils/channel-brain');
      reply = await runBrain({ channel: 'sms', chatKey: from, text: cleanCommand });
    } else {
      const { sendMessage } = require('../utils/api');
      const { getConfig } = require('../utils/config');
      const cfg = getConfig();
      const systemPrompt = `You are a helpful SMS assistant. Keep responses concise (SMS format).`;
      const response = await sendMessage(
        cfg.providerApiKey || cfg.apiKey || '', 'universal-provider', cleanCommand,
        `sms_${from}`, systemPrompt, { noTools: true }
      );
      reply = response?.reply || response?.message || '';
    }

    if (reply) {
      await sendSmsMessage(config, from, reply);
      log('sms', `Reply sent to ${from} (${reply.length} chars)`, 'green');
    }
  } catch (err) {
    log('sms', `Response error: ${err.message}`, 'red');
  }

  return { status: 200, body: { ok: true } };
}

function stopSmsProvider() {
  smsReplayCache.clear();
  smsRateLimitMap.clear();
  global.smsProvider = null;
}

function startHttpServer() {
  const http = require('http');
  
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.method === 'POST' && req.url === '/webhooks/sms') {
      // Twilio SMS webhook handler
      const { getConfig, saveConfig } = require('../utils/config');
      const cfg = getConfig();

      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        // Parse form-encoded body
        const params = new URLSearchParams(body);
        const formBody = {};
        for (const [k, v] of params) formBody[k] = v;

        // Create a mock req-like object for signature validation
        const mockReq = {
          url: req.url,
          headers: req.headers,
          socket: req.socket,
        };

        const result = await handleSmsWebhook(cfg, formBody, mockReq);
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/send') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const { channel, target, message } = JSON.parse(body);
          
          if (!channel || !target || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: channel, target, message' }));
            return;
          }
          
          if (channel === 'whatsapp') {
            if (!global.whatsappSock) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'WhatsApp not connected' }));
              return;
            }
            
            const normalizedTarget = target.replace(/[^\d]/g, '');
            const jid = `${normalizedTarget}@s.whatsapp.net`;
            
            await global.whatsappSock.sendMessage(jid, { text: message });
            
            log('http', `WhatsApp message sent to ${target}`, 'green');
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, channel: 'whatsapp', target }));
            
          } else if (channel === 'telegram') {
            if (!global.telegramBot) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Telegram not connected' }));
              return;
            }
            
            const chatId = target.trim();
            if (!/^-?\d+$/.test(chatId)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid Telegram chat ID' }));
              return;
            }
            
            await global.telegramBot.sendMessage(chatId, message);
            
            log('http', `Telegram message sent to ${target}`, 'green');
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, channel: 'telegram', target }));
            
          } else if (channel === 'signal') {
            const { getConfig, saveConfig } = require('../utils/config');
            const cfg = getConfig();
            if (!cfg.signalHttpUrl) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Signal not connected' }));
              return;
            }
            await sendSignalMessage(cfg, target, message);
            log('http', `Signal message sent to ${target}`, 'green');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, channel: 'signal', target }));
          } else if (channel === 'irc') {
            if (!global.ircClient?.isReady()) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'IRC not connected' }));
              return;
            }
            sendIrcMessage(ircClient, target, message);
            log('http', `IRC message sent to ${target}`, 'green');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, channel: 'irc', target }));
          } else if (channel === 'mattermost') {
            if (!global.mattermostProvider) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Mattermost not connected' }));
              return;
            }
            // Load fresh config inside the handler — the surrounding
            // `startHttpServer` scope does not bind `config`.
            const { getConfig: _gc1 } = require('../utils/config');
            await sendMattermostMessage(_gc1(), target, message);
            log('http', `Mattermost message sent to channel ${target}`, 'green');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, channel: 'mattermost', target }));
          } else if (channel === 'imessage') {
            if (!global.imessageProvider) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'iMessage not connected' }));
              return;
            }
            try {
              execSync(`${global.imessageProvider.imsgPath} send --to "${target.replace(/"/g, '\\"')}" --text "${message.replace(/"/g, '\\"')}" 2>/dev/null`, {
                timeout: 15000, stdio: 'pipe',
              });
              log('http', `iMessage sent to ${target}`, 'green');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, channel: 'imessage', target }));
            } catch (sendErr) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `iMessage send failed: ${sendErr.message}` }));
            }
          } else if (channel === 'sms') {
            if (!global.smsProvider) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'SMS not connected' }));
              return;
            }
            const { getConfig: _gc2 } = require('../utils/config');
            await sendSmsMessage(_gc2(), target, message);
            log('http', `SMS sent to ${target}`, 'green');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, channel: 'sms', target }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid channel. Use "whatsapp" or "telegram"' }));
          }
          
        } catch (err) {
          log('http', `Error: ${err.message}`, 'red');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  server.listen(3847, '127.0.0.1', () => {
    log('http', 'HTTP server listening on http://127.0.0.1:3847', 'green');
  });
  
  server.on('error', (err) => {
    log('http', `Server error: ${err.message}`, 'red');
  });
}

function startCronJobs(config) {
  try {
    const nodeCron = require('node-cron');
    const CRONS_FILE = path.join(os.homedir(), '.natureco', 'crons.json');
    
    if (!fs.existsSync(CRONS_FILE)) {
      log('cron', 'No cron jobs configured', 'gray');
      return;
    }
    
    const crons = JSON.parse(fs.readFileSync(CRONS_FILE, 'utf-8'));
    const enabledCrons = crons.filter(c => c.enabled);
    
    if (enabledCrons.length === 0) {
      log('cron', 'No enabled cron jobs', 'gray');
      return;
    }
    
    log('cron', `Loading ${enabledCrons.length} cron job(s)...`, 'cyan');
    
    enabledCrons.forEach(cronJob => {
      try {
        nodeCron.schedule(cronJob.schedule, async () => {
          log('cron', `Triggered: ${cronJob.name}`, 'yellow');
          
          try {
            // Get provider config
            const { getConfig, saveConfig } = require('../utils/config');
            const cfg = getConfig();
            
            if (!cfg.providerUrl || !cfg.providerApiKey) {
              log('cron', 'Provider not configured', 'red');
              return;
            }
            
            const isAnthropic = cfg.providerUrl.includes('anthropic.com');
            
            log('cron', `Sending prompt to AI (no tools)...`, 'cyan');
            
            // Make direct API call without tools
            let reply = '';
            
            if (isAnthropic) {
              // Anthropic API
              const response = await fetch(`${cfg.providerUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                  'x-api-key': cfg.providerApiKey,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: cfg.providerModel || 'claude-3-5-sonnet-20241022',
                  max_tokens: 1000,
                  messages: [{ role: 'user', content: cronJob.prompt }]
                }),
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                throw new ApiError(`Anthropic API error: ${response.status} - ${errorText}`, response.status);
              }
              
              const data = await response.json();
              reply = data.content.find(c => c.type === 'text')?.text || '';
              
            } else {
              // OpenAI-compatible API
              const response = await fetch(`${cfg.providerUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${cfg.providerApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: cfg.providerModel || 'llama-3.3-70b-versatile',
                  messages: [{ role: 'user', content: cronJob.prompt }],
                  temperature: 0.7,
                  max_tokens: 1000,
                }),
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                throw new ApiError(`Provider API error: ${response.status} - ${errorText}`, response.status);
              }
              
              const data = await response.json();
              reply = data.choices[0].message.content;
            }
            
            if (!reply) {
              log('cron', `No response from AI`, 'red');
              return;
            }
            
            log('cron', `AI response received (${reply.length} chars)`, 'green');
            
            // Send to target channel
            if (cronJob.action === 'whatsapp') {
              if (!global.whatsappSock) {
                log('cron', `WhatsApp not connected, skipping`, 'red');
                return;
              }
              
              const normalizedTarget = cronJob.target.replace(/[^\d]/g, '');
              const jid = `${normalizedTarget}@s.whatsapp.net`;
              
              await global.whatsappSock.sendMessage(jid, { text: reply });
              log('cron', `Sent to WhatsApp: ${cronJob.target}`, 'green');
              
            } else if (cronJob.action === 'telegram') {
              if (!global.telegramBot) {
                log('cron', `Telegram not connected, skipping`, 'red');
                return;
              }
              
              await global.telegramBot.sendMessage(cronJob.target, reply);
              log('cron', `Sent to Telegram: ${cronJob.target}`, 'green');
            } else if (cronJob.action === 'signal') {
              const { getConfig, saveConfig } = require('../utils/config');
              const cfg = getConfig();
              if (!cfg.signalHttpUrl) {
                log('cron', 'Signal not connected, skipping', 'red');
                return;
              }
              await sendSignalMessage(cfg, cronJob.target, reply);
              log('cron', `Sent to Signal: ${cronJob.target}`, 'green');
            } else if (cronJob.action === 'irc') {
              if (!global.ircClient?.isReady()) {
                log('cron', 'IRC not connected, skipping', 'red');
                return;
              }
              sendIrcMessage(ircClient, cronJob.target, reply);
              log('cron', `Sent to IRC: ${cronJob.target}`, 'green');
            } else if (cronJob.action === 'mattermost') {
              if (!global.mattermostProvider) {
                log('cron', 'Mattermost not connected, skipping', 'red');
                return;
              }
              await sendMattermostMessage(config, cronJob.target, reply);
              log('cron', `Sent to Mattermost: ${cronJob.target}`, 'green');
            } else if (cronJob.action === 'imessage') {
              if (!global.imessageProvider) {
                log('cron', 'iMessage not connected, skipping', 'red');
                return;
              }
              execSync(`${global.imessageProvider.imsgPath} send --to "${cronJob.target.replace(/"/g, '\\"')}" --text "${reply.replace(/"/g, '\\"')}" 2>/dev/null`, {
                timeout: 15000, stdio: 'pipe',
              });
              log('cron', `Sent to iMessage: ${cronJob.target}`, 'green');
            } else if (cronJob.action === 'sms') {
              if (!global.smsProvider) {
                log('cron', 'SMS not connected, skipping', 'red');
                return;
              }
              await sendSmsMessage(config, cronJob.target, reply);
              log('cron', `Sent to SMS: ${cronJob.target}`, 'green');
            }
            
          } catch (err) {
            log('cron', `Error executing ${cronJob.name}: ${err.message}`, 'red');
          }
        });
        
        log('cron', `Scheduled: ${cronJob.name} (${cronJob.schedule})`, 'green');
        
      } catch (err) {
        log('cron', `Failed to schedule ${cronJob.name}: ${err.message}`, 'red');
      }
    });
    
  } catch (err) {
    log('cron', `Failed to load cron jobs: ${err.message}`, 'red');
  }
}

function stopGateway() {
  if (!fs.existsSync(PID_FILE)) {
    console.log(chalk.gray('\n⚠️  Gateway not running\n'));
    return;
  }
  
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  
  try {
    // Try graceful shutdown first
    process.kill(pid, 'SIGTERM');
    
    // Wait a bit and check if process is still running
    setTimeout(() => {
      try {
        process.kill(pid, 0);
        // Process still running, force kill
        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(chalk.green('\n✅ Gateway stopped (force killed)\n'));
          } catch (err) {
            console.log(chalk.red(`\n❌ Failed to stop gateway: ${err.message}\n`));
          }
        } else {
          process.kill(pid, 'SIGKILL');
          console.log(chalk.green('\n✅ Gateway stopped (force killed)\n'));
        }
      } catch {
        // Process already stopped
        console.log(chalk.green('\n✅ Gateway stopped\n'));
      }
      
      // Remove PID file
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    }, 1000);
    
  } catch (err) {
    // Process not found, try force kill on Windows
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(chalk.green('\n✅ Gateway stopped\n'));
      } catch {
        console.log(chalk.yellow('\n⚠️  Gateway process not found\n'));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  Gateway process not found\n'));
    }
    
    // Remove stale PID file
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  }
}

function statusGateway() {
  if (!fs.existsSync(PID_FILE)) {
    console.log(chalk.gray('\n⚠️  Gateway not running\n'));
    return;
  }
  
  const pid = fs.readFileSync(PID_FILE, 'utf-8').trim();
  
  try {
    process.kill(pid, 0);
    console.log(chalk.green('\n✅ Gateway running\n'));
    console.log(chalk.cyan('PID:'), chalk.white(pid));
    console.log(chalk.cyan('Logs:'), chalk.white(LOG_FILE));
    
    // Show log tail if exists
    if (fs.existsSync(LOG_FILE)) {
      const logs = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(l => l.trim()).slice(-10).join('\n');
      console.log(chalk.gray('\nRecent logs (last 10):'));
      console.log(chalk.white(logs));
    }
    console.log('');
  } catch {
    console.log(chalk.gray('\n⚠️  Gateway not running (stale PID file)\n'));
    fs.unlinkSync(PID_FILE);
  }
}

function showLogs() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log(chalk.gray('\n⚠️  No logs found\n'));
    return;
  }
  
  const logs = fs.readFileSync(LOG_FILE, 'utf-8');
  console.log(logs);
}

// Direkt çalıştırılınca worker olarak başlat
if (require.main === module || process.argv.includes('--gateway-worker')) {
  gatewayServer('--gateway-worker');
}

module.exports = gatewayServer;
// v5.43: test için — kanal gönderen doğrulaması + hafıza izolasyonu (Madde 7)
module.exports.channelGate = channelGate;
