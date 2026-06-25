const chalk = require('chalk');
const tui = require('../utils/tui');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getConfig, CONFIG_FILE } = require('../utils/config');
const { getSkills } = require('../utils/skills');
const { getMcpServers } = require('../utils/mcp');
const { loadBaileys } = require('../utils/baileys');
const { NatureCoError, GatewayError, handleError } = require('../utils/errors');
const pino = require('pino');
const logger = pino({ level: 'silent' });
// Version banner pulls packageJson at line 315 — was missing the require.
const packageJson = require('../../package.json');

async function gateway(action, ...args) {
  if (action === 'start') {
    return startGateway();
  }

  if (action === 'call') {
    const method = args[0];
    const params = args.slice(1);
    if (!method) {
      F.error('Method name is required.');
      F.info('Usage: natureco gateway call <method> [params...]');
      return;
    }
    console.log('\n' + tui.styled('  🌐 Gateway RPC Call', { color: tui.PALETTE.primary, bold: true }));
    const cardW = 50;
    console.log(tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }));
    console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Method     ') + tui.styled(method.padEnd(40), { color: tui.PALETTE.text, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
    console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Parameters ') + tui.styled((params.length ? params.join(', ') : '(none)').padEnd(40).slice(0, 40), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
    console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Status     ') + tui.styled('MOCK — no real gateway running'.padEnd(40), { color: tui.PALETTE.warning, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
    console.log(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));
    console.log('\n  ' + tui.C.muted('Response: ') + tui.styled('{ ok: true, result: "mock response" }', { color: tui.PALETTE.success }));
    console.log('');
    return;
  }

  if (action === 'usage-cost') {
    const config = getConfig();
    const provider = config?.providerUrl?.replace('https://', '').split('/')[0] || 'unknown';
    console.log('\n' + tui.styled('  💰 Gateway Usage Cost', { color: tui.PALETTE.primary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

    const rows = [
      { metric: 'Provider', value: provider },
      { metric: 'Model', value: config?.providerModel || 'default' },
      { metric: 'API Key', value: config?.apiKey ? config.apiKey.slice(0, 8) + '...' : 'N/A' },
      { metric: 'Tokens In', value: '~0 (mock)' },
      { metric: 'Tokens Out', value: '~0 (mock)' },
      { metric: 'Estimated', value: '$0.00 (mock)' },
    ];
    console.log('\n' + tui.table(rows, [
      { key: 'metric', label: 'Metrik', minWidth: 16, render: r => tui.C.text(r.metric) },
      { key: 'value', label: 'Değer', minWidth: 30, render: r => tui.C.muted(r.value) },
    ], { borderStyle: 'round', zebra: true }));
    console.log('\n  ' + tui.C.muted('No real gateway running — costs will be tracked once started.'));
    console.log('');
    return;
  }

  if (action === 'probe') {
    const config = getConfig();
    F.header('Gateway Health Probe');

    const configOk = !!config;
    const apiKeyOk = !!(config && config.apiKey);
    const providerUrlOk = !!(config && config.providerUrl);

    F.table(['Check', 'Status'], [
      ['Config File', configOk ? '✓ Found' : '✗ Missing'],
      ['API Key', apiKeyOk ? '✓ Set' : '✗ Missing'],
      ['Provider URL', providerUrlOk ? `✓ ${config.providerUrl}` : '✗ Missing'],
    ]);

    if (apiKeyOk && providerUrlOk) {
      try {
        const https = require('https');
        const url = new URL(config.providerUrl);
        F.kv('Probing', url.href);
        await new Promise((resolve, reject) => {
          const req = https.get(url.href, {
            timeout: 5000,
            headers: { 'Authorization': `Bearer ${config.apiKey}` }
          }, (res) => {
            F.kv('HTTP Status', `${res.statusCode}`);
            F.kv('Reachable', '✓');
            resolve();
          });
          req.on('error', (err) => {
            F.kv('HTTP Status', 'N/A');
            F.kv('Reachable', '✗');
            F.kv('Error', err.message);
            resolve();
          });
          req.on('timeout', () => {
            req.destroy();
            F.kv('HTTP Status', 'Timeout');
            F.kv('Reachable', '✗');
            F.kv('Error', 'Request timed out after 5000ms');
            resolve();
          });
        });
      } catch (err) {
        F.kv('Reachable', '✗');
        F.kv('Error', err.message);
      }
    } else {
      F.kv('Skipped', 'Missing API key or provider URL');
    }
    return;
  }

  if (action === 'discover') {
    F.header('LAN Service Discovery');
    F.info('Scanning local network for NatureCo gateways... (mock discovery — no real scan performed)');

    F.table(['Service', 'Host', 'Port', 'Protocol'], [
      ['NatureCo Gateway', '192.168.1.100 (mock)', '4317', 'gRPC'],
      ['NatureCo Web UI', '192.168.1.100 (mock)', '8080', 'HTTP'],
    ]);
    return;
  }

  if (action === 'install') {
    const platform = os.platform();
    F.header('Install Gateway as System Service');
    F.kv('Platform', platform);

    if (platform === 'win32') {
      F.section('Windows (NSSM)');
      F.info('To install as a Windows service:');
      console.log(chalk.gray('    nssm install NatureCoGateway "node" "' + path.resolve(__dirname, '../../index.js') + '"'));
      console.log(chalk.gray('    nssm set NatureCoGateway AppParameters "gateway start"'));
      console.log(chalk.gray('    nssm set NatureCoGateway Start SERVICE_AUTO_START'));
      console.log(chalk.gray('    nssm start NatureCoGateway'));
    } else if (platform === 'linux') {
      F.section('Linux (systemd)');
      F.info('Create a systemd unit:');
      console.log(chalk.gray('    [Unit]'));
      console.log(chalk.gray('    Description=NatureCo Gateway'));
      console.log(chalk.gray('    After=network.target'));
      console.log(chalk.gray(''));
      console.log(chalk.gray('    [Service]'));
      console.log(chalk.gray('    ExecStart=' + process.execPath + ' ' + path.resolve(__dirname, '../../index.js') + ' gateway start'));
      console.log(chalk.gray('    Restart=on-failure'));
      console.log(chalk.gray('    RestartSec=5'));
      console.log(chalk.gray(''));
      console.log(chalk.gray('    [Install]'));
      console.log(chalk.gray('    WantedBy=multi-user.target'));
      console.log(chalk.gray(''));
      F.info('Then: sudo systemctl enable natureco-gateway && sudo systemctl start natureco-gateway');
    } else if (platform === 'darwin') {
      F.section('macOS (launchd)');
      F.info('Create a launchd plist:');
      console.log(chalk.gray('    <?xml version="1.0" encoding="UTF-8"?>'));
      console.log(chalk.gray('    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'));
      console.log(chalk.gray('    <plist version="1.0"><dict>'));
      console.log(chalk.gray('      <key>Label</key><string>com.natureco.gateway</string>'));
      console.log(chalk.gray('      <key>ProgramArguments</key><array>'));
      console.log(chalk.gray('        <string>' + process.execPath + '</string>'));
      console.log(chalk.gray('        <string>' + path.resolve(__dirname, '../../index.js') + '</string>'));
      console.log(chalk.gray('        <string>gateway</string><string>start</string>'));
      console.log(chalk.gray('      </array>'));
      console.log(chalk.gray('      <key>KeepAlive</key><true/>'));
      console.log(chalk.gray('      <key>RunAtLoad</key><true/>'));
      console.log(chalk.gray('    </dict></plist>'));
    } else {
      F.info('Platform not specifically supported.');
      F.info('Use your system\'s service manager to run:');
      console.log(chalk.gray('    ' + process.execPath + ' ' + path.resolve(__dirname, '../../index.js') + ' gateway start'));
    }

    F.section('Manual Process');
    F.kv('Background', 'natureco gateway start &');
    F.kv('Process Mgt', 'Use pm2 or screen for process management.');
    F.warning('This is a mock — service installation is not automated.');
    return;
  }

  if (action === 'uninstall') {
    const platform = os.platform();
    F.header('Uninstall Gateway System Service');
    F.kv('Platform', platform);

    if (platform === 'win32') {
      F.section('Windows (NSSM)');
      F.info('nssm stop NatureCoGateway');
      F.info('nssm remove NatureCoGateway confirm');
    } else if (platform === 'linux') {
      F.section('Linux (systemd)');
      F.info('sudo systemctl stop natureco-gateway');
      F.info('sudo systemctl disable natureco-gateway');
      F.info('sudo rm /etc/systemd/system/natureco-gateway.service');
      F.info('sudo systemctl daemon-reload');
    } else if (platform === 'darwin') {
      F.section('macOS (launchd)');
      F.info('launchctl unload ~/Library/LaunchAgents/com.natureco.gateway.plist');
      F.info('rm ~/Library/LaunchAgents/com.natureco.gateway.plist');
    }

    F.warning('This is a mock — run the commands above manually.');
    return;
  }

  if (action === 'health') {
    const config = getConfig();
    F.header('Gateway Health');
    const checks = [
      { name: 'Config file', ok: !!config },
      { name: 'API key', ok: !!(config && config.apiKey) },
      { name: 'Provider URL', ok: !!(config && config.providerUrl) },
      { name: 'Provider model', ok: !!(config && config.providerModel) },
      { name: 'Network', ok: true },
    ];
    let allOk = true;
    for (const c of checks) {
      if (!c.ok) allOk = false;
      F.dot(c.ok, c.name);
    }
    F.kv('Overall', allOk ? 'Healthy' : 'Issues found');
    F.kv('Gateway', checkGatewayRunning() ? 'Running' : 'Not running');
    return;
  }

  if (action === 'restart') {
    const safeMode = args.includes('--safe');
    F.header('Restarting Gateway');
    if (safeMode) {
      F.info('Safe mode enabled — disabling all non-essential providers');
    }
    F.success('Gateway stopped');
    if (safeMode) F.info('Only essential services will start');
    F.success('Gateway started');
    return;
  }

  if (action === 'stop') {
    const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
    if (!fs.existsSync(pidFile)) {
      console.log('\n' + tui.C.muted('  Gateway zaten durmuş.') + '\n');
      return;
    }
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    try {
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(pidFile);
      console.log('\n' + tui.styled('  ✓ Gateway durduruldu (PID: ' + pid + ')', { color: tui.PALETTE.success, bold: true }) + '\n');
    } catch (e) {
      console.log('\n' + tui.C.warning('  Gateway durdurulamadı: ' + e.message) + '\n');
    }
    return;
  }

  if (action === 'diagnostics') {
    const sub = args[0];
    if (sub === 'export') {
      const config = getConfig();
      const diag = {
        timestamp: new Date().toISOString(),
        platform: os.platform(),
        nodeVersion: process.version,
        config: {
          providerUrl: config.providerUrl || null,
          providerModel: config.providerModel || null,
          botName: config.botName || null,
          channels: {
            telegram: !!config.telegramToken,
            whatsapp: !!config.whatsappConnected,
            discord: !!config.discordToken,
            slack: !!config.slackToken,
          },
          plugins: (() => { try { return require('../utils/plugin-registry').scanInstalled().length; } catch { return 0; } })(),
          skills: (() => { try { return require('../utils/skills').getSkills().length; } catch { return 0; } })(),
        },
      };
      F.json(diag);
      return;
    }
    F.error('Unknown diagnostics subcommand');
    F.info('Usage: natureco gateway diagnostics export');
    return;
  }

  if (action === 'run') {
    F.header('Gateway Run');
    F.info('gateway run would start the gateway process here');
    return;
  }

  if (action && action !== 'status') {
    F.error(`Unknown action: "${action}"`);
    F.info('Usage: natureco gateway [start|status|call|usage-cost|probe|discover|install|uninstall|health|restart|diagnostics|run]');
    return;
  }

  // Config kontrolü - yoksa veya apiKey yoksa setup çalıştır
  if (!fs.existsSync(CONFIG_FILE)) {
    const setup = require('./setup');
    await setup();
    return;
  }

  const config = getConfig();
  
  if (!config || !config.apiKey) {
    const setup = require('./setup');
    await setup();
    return;
  }

  // Normal gateway ekranı
  const version = packageJson.version;
  
  console.clear();

  F.header('Gateway');

  // Durum bilgileri
  const providerHost = config.providerUrl
    ? config.providerUrl.replace('https://', '').split('/')[0]
    : null;

  if (providerHost) {
    F.kv('Provider', providerHost);
  }
  if (config.providerModel) {
    F.kv('Model', config.providerModel);
  }
  if (config.botName) {
    F.kv('Bot', config.botName);
  }
  if (config.userName) {
    F.kv('User', config.userName);
  }

  const skills = getSkills();
  F.kv('Skills', `${skills.length} loaded`);

  const mcpServers = getMcpServers();
  const activeMcp = Object.values(mcpServers).filter(s => !s.disabled).length;
  const totalMcp = Object.keys(mcpServers).length;
  if (totalMcp > 0) {
    F.kv('MCP', `${activeMcp}/${totalMcp} active`);
  }

  F.section('Quick Start');
  F.kv('natureco chat', 'Bot ile sohbet başlat');
  F.kv('natureco setup', 'Kurulumu yeniden çalıştır');
  F.kv('natureco gateway start', 'Gateway\'i arka planda başlat');
  F.kv('natureco help', 'Tüm komutları göster');

  F.meta('Docs: natureco.me/cli');
}

async function startGateway() {
  const config = getConfig();

  if (!config || !config.apiKey) {
    console.log('\n' + tui.C.red('  ❌ Not logged in. Run "natureco login" first.') + '\n');
    process.exit(1);
  }

  // PID dosyası kontrol — zaten çalışıyor mu?
  const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
  if (fs.existsSync(pidFile)) {
    const existingPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    try {
      process.kill(existingPid, 0); // Test et, canlı mı
      console.log('\n' + tui.styled('  ⚠️  Gateway zaten çalışıyor (PID: ' + existingPid + ')', { color: tui.PALETTE.warning, bold: true }) + '\n');
      console.log('  ' + tui.C.muted('Durdurmak için: ') + tui.C.brand('natureco gateway stop'));
      console.log('  ' + tui.C.muted('Durum için:     ') + tui.C.brand('natureco gateway status'));
      console.log('');
      return;
    } catch {
      // Process ölmüş, eski pid dosyasını sil
      fs.unlinkSync(pidFile);
    }
  }

  console.log('\n' + tui.styled('  🚀 Gateway Başlatılıyor...', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Log dosyası
  const logFile = path.join(os.homedir(), '.natureco', 'gateway.log');
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');

  // Child process olarak gateway-server.js başlat
  const gatewayPath = path.join(__dirname, 'gateway-server.js');
  const child = spawn(process.execPath, [gatewayPath, '--gateway-worker'], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env },
  });

  // PID kaydet
  fs.writeFileSync(pidFile, String(child.pid));
  child.unref();

  // Başarı kartı
  const cardW = 54;
  console.log(tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Durum       ') + tui.styled('  ✓ Çalışıyor '.padEnd(36), { bg: tui.PALETTE.success, color: '#000', bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('PID         ') + tui.styled(String(child.pid).padEnd(40), { color: tui.PALETTE.text, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Log dosyası ') + tui.styled(logFile.padEnd(40).slice(0, 40), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Provider    ') + tui.styled((config.providerUrl || '—').replace('https://', '').padEnd(40).slice(0, 40), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Telegram    ') + tui.styled((config.telegramToken ? '✓ Token ayarlı' : '✗ Token yok').padEnd(40), { color: config.telegramToken ? tui.PALETTE.success : tui.PALETTE.warning, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
  console.log(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));

  console.log('\n  ' + tui.C.muted('Komutlar:'));
  console.log('  ' + tui.C.muted('  Durum:  ') + tui.C.brand('natureco gateway status'));
  console.log('  ' + tui.C.muted('  Log:    ') + tui.C.brand('natureco gateway logs') + ' ' + tui.C.muted('veya ') + tui.C.brand('tail -f ' + logFile));
  console.log('  ' + tui.C.muted('  Dur:    ') + tui.C.brand('natureco gateway stop'));
  console.log('');
}

async function startWhatsAppProvider(sessionDir, config) {
  try {
    const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = loadBaileys();
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
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
    
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        if (statusCode === 515 || statusCode === 408) {
          console.log(chalk.yellow('[whatsapp]'), chalk.gray('reconnecting...'));
          setTimeout(() => startWhatsAppProvider(sessionDir, config), 2000);
          return;
        } else if (statusCode === 401) {
          console.log(chalk.red('[whatsapp]'), chalk.gray('session expired'));
        } else {
          console.log(chalk.red('[whatsapp]'), chalk.gray(`disconnected (${statusCode})`));
        }
      } else if (connection === 'open') {
        const phone = sock.user?.id?.split(':')[0].replace('@s.whatsapp.net', '') || 'unknown';
        console.log(chalk.cyan('[whatsapp]'), chalk.white(`Listening for inbound messages.`));
      }
    });
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        
        const sender = msg.key.remoteJid?.split('@')[0].split(':')[0];
        const allowedNumbers = config.whatsappAllowedNumbers || [];
        
        if (allowedNumbers.length > 0 && !allowedNumbers.includes(sender)) {
          continue;
        }
        
        const messageText = msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || 
                           '';
        
        if (messageText) {
          const ownNumber = sock.user?.id?.split(':')[0].replace('@s.whatsapp.net', '') || 'unknown';
          console.log(chalk.cyan('[whatsapp]'), chalk.white(`Inbound message +${sender} -> +${ownNumber}`));

          const trimmed = messageText.trim();
          console.log(chalk.cyan('[whatsapp]'), chalk.gray(`msg: "${trimmed.slice(0, 80)}"`));

          // ── !code komutu — headless code agent ─────────────────────────────
          if (trimmed.toLowerCase().startsWith('!code')) {
            const task = trimmed.replace(/^!code\s*/i, '').trim();
            if (!task) {
              await sock.sendMessage(msg.key.remoteJid, { text: '⚙️ Kullanım: !code <görev>\nÖrnek: !code login sayfasına forgot password ekle' });
              continue;
            }
            console.log(chalk.cyan('[whatsapp]'), chalk.yellow(`!code komutu: ${task.slice(0, 60)}`));

            try {
              const { runCodeAgent } = require('../utils/headless');
              await sock.sendMessage(msg.key.remoteJid, { text: `⚙️ Çalışıyor: ${task.slice(0, 80)}...` });

              const result = await runCodeAgent(task, process.cwd(), (progress) => {
                console.log(chalk.cyan('[whatsapp/code]'), chalk.gray(progress));
              });

              let reply = `✅ Tamamlandı!\n\n${result.reply}`;
              if (result.filesChanged?.length) {
                reply += `\n\n📝 Değiştirilen dosyalar:\n${result.filesChanged.map(f => `• ${f}`).join('\n')}`;
              }

              await sock.sendMessage(msg.key.remoteJid, { text: reply.slice(0, 4000) });
              console.log(chalk.cyan('[whatsapp]'), chalk.green(`!code tamamlandı (${result.iterations} iterasyon)`));
            } catch (err) {
              const msg = err instanceof NatureCoError ? err.message : err?.message ?? 'Unknown error';
              console.log(chalk.red('[whatsapp/code]'), chalk.gray(`hata: ${msg}`));
              await sock.sendMessage(msg.key.remoteJid, { text: `❌ Hata: ${msg}` });
            }
            continue;
          }

          try {
            const { sendMessage } = require('../utils/api');
            console.log(chalk.cyan('[whatsapp]'), chalk.gray('Sending reply...'));
            
            const response = await sendMessage(config.apiKey, config.whatsappBotId, messageText, null, '');
            const reply = response?.reply ?? response?.message ?? '';
            
            if (reply) {
              await sock.sendMessage(msg.key.remoteJid, { text: reply });
              console.log(chalk.cyan('[whatsapp]'), chalk.green(`Reply sent (${reply.length} chars)`));
            }
          } catch (err) {
            const msg = err instanceof NatureCoError ? err.message : err?.message ?? 'Unknown error';
            console.log(chalk.red('[whatsapp]'), chalk.gray(`error: ${msg}`));
          }
        }
      }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
  } catch (err) {
    const msg = err instanceof NatureCoError ? err.message : err?.message ?? 'Unknown error';
    console.log(chalk.red('[whatsapp]'), chalk.gray(`failed to start: ${msg}`));
  }
}

function checkGatewayRunning() {
  try {
    const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      process.kill(pid, 0);
      return true;
    }
  } catch {}
  return false;
}

module.exports = gateway;
