const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');
const inquirer = require('../utils/inquirer-wrapper');
const TB = require('../utils/token-budget');
const tui = require('../utils/tui');
const chalk = require('chalk');
const { getLang: _getLang } = require('../utils/i18n');
const L = (tr, en) => (_getLang() === 'en' ? en : tr);
const { getApiKey, getConfig } = require('../utils/config');
const repl = require('./repl');
const { getSkillPrompts, getSkills } = require('../utils/skills');
const { getAgentsPrompt } = require('../utils/agents');
const { addToHistory } = require('../utils/history');
const { getMemoryPrompt, extractMemoryFromMessage, loadMemory, clearMemory, addMemoryEntry } = require('../utils/memory');
const { getCommands, getCommandContent } = require('../utils/commands');
const { runHooks } = require('../utils/hooks');
const { createSession, loadSession, getLatestSession, addMessageToSession, loadLastSession, listSessions, saveSession } = require('../utils/sessions');
const { NatureCoError, ApiError, handleError } = require('../utils/errors');
const { getSessionStats, resetSessionStats } = require('../utils/tool-runner');
// getBots + sendMessage / _sendMessage are referenced later (loadProviders
// pre-warm, fallback non-streaming path) but the require was missing —
// the code only worked when something else in the load order had already
// required api.js.
const { getBots, sendMessage, _sendMessage } = require('../utils/api');

const ASCII_LOGO = [
  '███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗',
  '████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔════╝ ██╔═══██╗',
  '██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║      ██║   ██║',
  '██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║      ██║   ██║',
  '██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╗ ╚██████╔╝',
  '╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝',
];

// ── Tips ─────────────────────────────────────────────────────────────────────
const TIPS = [
  "🌿 Nature.co'da canlı yayın yapabilir, sesli odalarda buluşabilirsin — natureco.me",
  '🤖 NatureBot AI ile içerik üret, topluluğunu yönet, trendi yakala — natureco.me/robot-house',
  '📡 Geliştirici API ile platformu entegre et — natureco.me/developer',
  '🏆 Günlük görevler tamamla, XP kazan, liderlik tablosuna gir — natureco.me',
  "📺 Nature TV'de doğa belgeselleri ve oyun yayınları tek platformda!",
  '👥 Kendi sunucunu kur, özel kanallar ve roller oluştur — natureco.me',
  '🔌 WordPress sitene tek tıkla NatureBot ekle — natureco SDK ile entegre et',
  "📱 Nature.co masaüstü uygulaması — Mac, Windows ve Android TV'de mevcut!",
  '🌍 Forum, blog ve etkinlikler — topluluğa katıl, doğa projelerinde yer al',
];

// ── What's New ────────────────────────────────────────────────────────────────
const CHANGELOG = [
  'Eklendi: Chalk TUI — saf readline tabanlı arayüz',
  'Eklendi: agents, plugins, pairing, uninstall komutları',
  'Eklendi: channels, models, memory, logs, status, security, reset',
  'Düzeltildi: Çift karakter ve input sorunu giderildi',
  'Düzeltildi: Token optimizasyonu — sistem prompt sıkıştırıldı',
];

const sep = () => chalk.gray('─'.repeat(process.stdout.columns || 80));

function centerText(text) {
  const width = process.stdout.columns || 120;
  return text.split('\n').map(line => {
    const padding = Math.max(0, Math.floor((width - line.length) / 2));
    return ' '.repeat(padding) + line;
  }).join('\n');
}

async function chat(botName, options = {}) {
  const apiKey = getApiKey();
  const config = getConfig();
  const version = require('../../package.json').version;

  // v4.6+ Modern: chat komutu doğrudan REPL'i başlatır
  // Eski NatureCo backend (api.natureco.me) yerine provider URL kullanılır
  // Avantajlar: TUI engine, cross-session memory, /resume, /sessions
  // Önceki v2.23 davranışı: ASCII art, bot seçimi, inquirer prompt, vb.
  // Bu refactor, eski tüm komutları (session, memory, hooks, custom commands) korur
  // ama provider URL (api.minimax.io, api.groq.com) üzerinden direkt LLM'e bağlanır
  // Provider ayarlı değilse veya natureco.me değilse REPL'e yönlendir
  if (!config.providerUrl || !config.providerUrl.includes('natureco.me')) {
    // Resume parametresi REPL'e geçir
    const replArgs = [];
    if (options.resume === true || options.resume) {
      replArgs.push('--resume', String(options.resume === true ? 'last' : options.resume));
    }
    console.log('');
    console.log(tui.styled('  🌿 NatureCo Chat v4.6+', { color: tui.PALETTE.primary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log(tui.C.muted('  Chat komutu artık ') + tui.C.brand('repl') + tui.C.muted(' komutunu çağırıyor (Phase 9 TUI engine)'));
    console.log(tui.C.muted('  Tüm özellikler korundu: memory, sessions, hooks, custom commands'));
    console.log('');
    return repl(replArgs);
  }

  // Eski v2.23 davranışı (NatureCo backend bağımlı)
  if (options.list) {
    const sessions = listSessions('chat');
    if (!sessions.length) {
      console.log(chalk.gray('\nKayıtlı oturum yok.\n'));
      return;
    }
    sessions.forEach(s => {
      console.log(`  [${s.id}] ${s.savedAt.slice(0, 10)} — ${s.preview || '(boş)'} (${s.messageCount} mesaj)`);
    });
    console.log();
    return;
  }

  // ── Bot seçimi ──────────────────────────────────────────────────────────────
  let botList;
  try {
    botList = await getBots(apiKey ?? config.providerApiKey ?? '');
  } catch (err) {
    handleError(err, { prefix: '❌ Error', exit: true });
  }

  if (!botList?.bots?.length) {
    console.log(chalk.gray('No bots found. Create one at https://developers.natureco.me\n'));
    process.exit(1);
  }

  let bot;
  if (!botName) {
    if (config.botName) {
      bot = botList.bots.find(b => b.name && b.name.toLowerCase() === config.botName.toLowerCase());
    }
    if (!bot) {
      process.stdin.resume();
      const { selectedBot } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedBot',
        message: 'Bot seçin:',
        choices: botList.bots.map(b => ({ name: b.name, value: b.id })),
      }]);
      bot = botList.bots.find(b => b.id === selectedBot);
    }
  } else {
    bot = botList.bots.find(b => b.name && botName && b.name.toLowerCase() === botName.toLowerCase());
    if (!bot) {
      console.log(chalk.red(`\n❌ Bot "${botName}" not found.\n`));
      process.exit(1);
    }
  }

  // ── Hafıza & sistem prompt ──────────────────────────────────────────────────
  const mem = loadMemory(bot.id);
  const displayBotName = mem.botName || bot.name || 'NatureCo';
  const userName = mem.name || config.userName || 'User';
  const providerModel = config.providerModel || 'unknown';
  const shortModel = providerModel.split('/').pop().split('-').slice(0, 3).join('-');

  const skillPrompts = getSkillPrompts();
  const agentsPrompt = getAgentsPrompt();
  const memoryPrompt = getMemoryPrompt(bot.id);

  let systemPrompt = '';
  if (config.providerUrl && config.providerUrl.includes('natureco.me')) {
    systemPrompt = 'Sen yardımcı bir AI asistansın.';
  } else {
    if (skillPrompts) systemPrompt += skillPrompts;
    if (agentsPrompt) systemPrompt += `\n\n## Project Instructions\n${agentsPrompt}`;
    if (memoryPrompt) systemPrompt += '\n\n' + memoryPrompt;
  }

  systemPrompt = TB.trimSystemPrompt(systemPrompt);

  // ── Session ─────────────────────────────────────────────────────────────────
  let session;
  if (options.resume) {
    session = options.resume === true
      ? getLatestSession(bot.id) || createSession(bot.id, bot.name)
      : loadSession(bot.id, options.resume) || createSession(bot.id, bot.name);
  } else if (options.continue) {
    const last = loadLastSession('chat');
    if (last) {
      console.log(chalk.cyan(`  ↻ Son oturum yüklendi (${last.messages.length} mesaj)\n`));
    }
    session = createSession(bot.id, bot.name);
  } else {
    session = createSession(bot.id, bot.name);
  }

  let conversationId = null;
  let messagesCount = 0;
  resetSessionStats();

  // ── What's New kontrolü ─────────────────────────────────────────────────────
  const lastVersionFile = path.join(os.homedir(), '.natureco', 'lastVersion');
  let lastVersion = '';
  try { lastVersion = fs.readFileSync(lastVersionFile, 'utf8').trim(); } catch {}
  const isNewVersion = lastVersion !== version;

  // ── Header ──────────────────────────────────────────────────────────────────
  console.clear();
  console.log(centerText(ASCII_LOGO.map((line, i) => i < 5 ? chalk.green(line) : chalk.gray(line)).join('\n')));
  console.log();
  console.log(centerText(chalk.cyan(`(\\_/)  Hoş geldin, ${userName}  ·  ${displayBotName} hazır  ·  v${version}`)));
  console.log(chalk.gray('─'.repeat(process.stdout.columns || 120)));
  console.log();

  // ── What's New ──────────────────────────────────────────────────────────────
  if (isNewVersion) {
    console.log(centerText(chalk.yellow(`── v${version} yenilikleri ──`)));
    CHANGELOG.forEach(c => console.log(centerText(chalk.gray(`· ${c}`))));
    console.log();
    try { fs.writeFileSync(lastVersionFile, version); } catch {}
  } else {
    // Yeni versiyon yoksa günlük tip göster
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % TIPS.length;
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 120)));
    console.log(centerText(chalk.yellow(TIPS[dayIndex])));
    console.log(chalk.gray('─'.repeat(process.stdout.columns || 120)));
    console.log();
  }

  // ── Önceki session mesajları ─────────────────────────────────────────────────
  if (options.resume && session.messages?.length) {
    const last = session.messages.slice(-(TB.load().conversationInContext));
    last.forEach(msg => {
      console.log(chalk.white('You  ') + msg.user);
      console.log(chalk.cyan(`${displayBotName}  `) + msg.bot);
      console.log();
    });
  }

  console.log(centerText(chalk.gray(`${shortModel}  ·  /help için yardım  ·  Ctrl+C çıkış`)));
  console.log(chalk.gray('─'.repeat(process.stdout.columns || 120)));
  console.log();

  // ── Yükleme animasyonu ──────────────────────────────────────────────────────
  let loadingTimer = null;
  const loadingFrames = ['●○○', '○●○', '○○●'];
  let loadingFrame = 0;

  function startLoading() {
    loadingFrame = 0;
    process.stdout.write(chalk.gray('  ' + loadingFrames[0]));
    loadingTimer = setInterval(() => {
      process.stdout.write('\r' + chalk.gray('  ' + loadingFrames[loadingFrame]));
      loadingFrame = (loadingFrame + 1) % loadingFrames.length;
    }, 300);
  }

  function stopLoading() {
    if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
    process.stdout.write('\r\x1b[2K');
  }

  // ── Mesaj gönderme ──────────────────────────────────────────────────────────
  async function handleMessage(userMessage) {
    userMessage = userMessage.trim();
    if (!userMessage) return;

    // /komutlar
    if (userMessage.startsWith('/')) {
      const [cmd, ...args] = userMessage.slice(1).split(' ');
      switch (cmd.toLowerCase()) {
        case 'clear':
          console.clear();
          return;
        case 'bot':
          if (!args.length) {
            console.log(chalk.yellow('Aktif bot: ') + bot.name);
            botList.bots.forEach(b => {
              const mark = b.id === bot.id ? chalk.green('✓ ') : '  ';
              console.log(mark + chalk.cyan(b.name));
            });
          } else {
            const newName = args.join(' ');
            const newBot = botList.bots.find(b => b.name.toLowerCase() === newName.toLowerCase());
            if (newBot) {
              bot = newBot;
              conversationId = null;
              session = createSession(bot.id, bot.name);
              console.log(chalk.green(`Bot değişti: ${newBot.name}`));
            } else {
              console.log(chalk.red(`${L('Bot bulunamadı', 'Bot not found')}: ${newName}`));
            }
          }
          console.log();
          return;
        case 'skills':
          const skills = getSkills();
          if (!skills.length) console.log(chalk.gray('Yüklü skill yok.'));
          else skills.forEach(s => console.log(chalk.cyan(`· ${s.name}`) + chalk.gray(`  ${s.description}`)));
          console.log();
          return;
        case 'memory':
          if (args[0] === 'clear') {
            clearMemory(bot.id);
            console.log(chalk.green('✓ Hafıza temizlendi'));
          } else {
            const m = loadMemory(bot.id);
            if (m.botName) console.log(chalk.cyan('Bot: ') + m.botName);
            if (m.name) console.log(chalk.cyan('İsim: ') + m.name);
            (m.facts || []).slice(0, 8).forEach(f => {
              const v = typeof f === 'string' ? f : f.value;
              console.log(chalk.gray(`· ${v}`));
            });
          }
          console.log();
          return;
        case 'help':
          console.log(chalk.yellow(L('Chat Komutları:', 'Chat commands:')));
          [
            ['/clear', 'Ekranı temizle'],
            ['/bot [ad]', 'Bot değiştir'],
            ['/skills', 'Skill listesi'],
            ['/memory', 'Hafızayı göster'],
            ['/memory clear', 'Hafızayı temizle'],
            ['/commands', 'Özel komutlar'],
            ['/help', 'Bu yardım'],
          ].forEach(([c, d]) => console.log('  ' + chalk.cyan(c.padEnd(16)) + chalk.gray(d)));
          console.log(chalk.gray('  Ctrl+C'.padEnd(18) + 'Çıkış'));
          console.log();
          return;
        case 'commands':
          const cmds = getCommands();
          if (!cmds.length) console.log(chalk.gray('Özel komut yok.'));
          else cmds.forEach(c => console.log(chalk.cyan(`/${c.name}`)));
          console.log();
          return;
        default:
          const customCmd = getCommandContent(cmd);
          if (customCmd) {
            const customPrompt = systemPrompt + '\n\n## Custom Command\n' + customCmd;
            const msg = args.length ? args.join(' ') : 'Execute the custom command instruction';
            console.log(chalk.white('You  ') + userMessage);
            startLoading();
            try {
              const res = await sendMessage(apiKey || config.providerApiKey, bot.id, msg, conversationId, customPrompt, options);
              stopLoading();
              if (res.conversation_id) conversationId = res.conversation_id;
              const reply = res.reply || res.message || '';
              console.log(chalk.cyan(`${displayBotName}  `) + reply);
              console.log();
              addToHistory(bot.id, userMessage, reply, conversationId);
              addMessageToSession(bot.id, session.id, userMessage, reply);
            } catch (e) { stopLoading(); handleError(e, { prefix: 'Error', exit: false }); console.log(); }
          } else {
            console.log(chalk.red(`Bilinmeyen komut: /${cmd}`));
            console.log();
          }
          return;
      }
    }

    // exit/quit
    if (userMessage === 'exit' || userMessage === 'quit') {
      await runHooks('on-exit', null, { botId: bot.id, botName: bot.name });
      console.log(chalk.gray('\n👋 Goodbye!\n'));
      process.exit(0);
    }

    // Normal mesaj
    userMessage = await runHooks('pre-message', userMessage, { botId: bot.id, botName: bot.name });
    console.log(chalk.white('You  ') + userMessage);
    messagesCount++;

    startLoading();

    try {
      let response = await _sendMessage(apiKey ?? config.providerApiKey, bot.id, userMessage, conversationId, systemPrompt, { ...options, noTools: true });
      stopLoading();

      if (response?.conversation_id) conversationId = response.conversation_id;

      let botReply = response?.reply ?? response?.message ?? 'No response';
      botReply = await runHooks('post-message', botReply, { botId: bot.id, botName: bot.name });

      console.log(chalk.cyan(`${displayBotName}  `) + botReply);
      console.log();

      addToHistory(bot.id, userMessage, botReply, conversationId);
      addMessageToSession(bot.id, session.id, userMessage, botReply);

      const memEntries = extractMemoryFromMessage(userMessage);
      for (const e of memEntries) addMemoryEntry(bot.id, e.key, e.value);

    } catch (err) {
      stopLoading();
      const errMsg = err instanceof NatureCoError
        ? err.message
        : (err?.message?.split('"message":"')[1]?.split('"')[0] ?? err?.message ?? 'Unknown error');
      console.log(chalk.red(`Error: ${errMsg}`));
      console.log();
    }
  }

  // ── Input loop ───────────────────────────────────────────────────────────────
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  process.on('SIGINT', async () => {
    await runHooks('on-exit', null, { botId: bot.id, botName: bot.name });
    rl.close();
    const { filesChanged, commandsRun } = getSessionStats();
    if (messagesCount > 0) {
      const historyMessages = [];
      if (session.messages?.length) {
        for (const m of session.messages) {
          historyMessages.push({ role: 'user', content: m.user });
          historyMessages.push({ role: 'assistant', content: m.bot });
        }
      }
      saveSession('chat', historyMessages, { botId: bot.id, botName: bot.name });
    }
    if (filesChanged > 0 || commandsRun > 0 || messagesCount > 0) {
      console.log(chalk.gray('\n─── Session Özeti ───'));
      if (filesChanged > 0) console.log(chalk.green(`  ✓ ${filesChanged} dosya değiştirildi`));
      if (commandsRun > 0) console.log(chalk.green(`  ✓ ${commandsRun} komut çalıştırıldı`));
      console.log(chalk.cyan(`  ✓ ${messagesCount} mesaj gönderildi`));
      console.log();
    }
    console.log(chalk.gray('👋 Goodbye!\n'));
    process.exit(0);
  });

  rl.on('close', () => process.exit(0));

  // ── on-start hooks ──────────────────────────────────────────────────────────
  await runHooks('on-start', null, { botId: bot.id, botName: bot.name });

  async function promptLoop() {
    rl.question('', async (msg) => {
      process.stdout.write('\x1b[1A\x1b[2K');
      await handleMessage(msg);
      promptLoop();
    });
  }

  promptLoop();
}

module.exports = chat;
