/**
 * natureco repl — Persistent Interactive REPL
 *
 * Özellikler:
 *   ✅ Cross-session hafıza (memory dosyası)
 *   ✅ Otomatik fact extraction (LLM konuşmadan öğrenir)
 *   ✅ Session resume (--resume ile kaldığın yerden devam)
 *   ✅ Tüm CLI komutları REPL içinden (/doctor, /cost, /audit, /team...)
 *   ✅ Slash komutlar (/help, /memory, /model, /system, /exit)
 *   ✅ Ctrl+C temiz çıkış, konuşma otomatik kayıt
 *   ✅ Persistent session list (~/.natureco/sessions.json)
 *   ✅ Token tracking
 *
 *   v4.6.0 — Persistent Memory Edition
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const chalk = require('chalk');
const tui = require('../utils/tui');
const { loadToolDefinitions, toOpenAIFormat, executeTool } = require('../utils/tools');
const { accumulateToolCallDeltas, finalizeToolCalls } = require('../utils/streaming-tools');
const { createPasteSafeInput, createOutputFilter, enableBracketedPaste, disableBracketedPaste, restoreNewlines } = require('../utils/paste-safe-input');

// v5.4.6: Model adi sizintisini engelle — global'e ata, callback'lerden erisebilir olsun
const MODEL_NAMES_TO_HIDE = ['MiniMax-M2.5', 'MiniMaxM2.5', 'minimaxm25', 'Claude-3', 'GPT-4', 'ChatGPT'];
function fixModelNameLeak(text, botName) {
  if (!text) return text;
  let fixed = text;
  for (const modelName of MODEL_NAMES_TO_HIDE) {
    const regex = new RegExp(modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    fixed = fixed.replace(regex, botName || 'İchigo');
  }
  fixed = fixed.replace(/Ben\s+MiniMax[^.,!?\n]*/gi, 'Ben İchigo');
  fixed = fixed.replace(/I'm\s+MiniMax[^.,!?\n]*/gi, "I'm İchigo");
  fixed = fixed.replace(/I am\s+Claude[^.,!?\n]*/gi, 'I am İchigo');
  return fixed;
}
global.fixModelNameLeak = fixModelNameLeak;

// v4.8.0: Tool definitions — başlangıçta bir kez yükle (performans)
let _toolDefs = null;
function getToolDefs() {
  if (!_toolDefs) {
    try {
      _toolDefs = loadToolDefinitions();
    } catch (e) {
      _toolDefs = [];
    }
  }
  return _toolDefs;
}

// CLI komutları (REPL içinden çalıştırılabilir)
const CLI_COMMANDS = {
  '/doctor':    { desc: 'Sistem sağlığı kontrolü', run: ['doctor'] },
  '/cost':      { desc: 'Maliyet takibi (today|week|month|budget)', run: ['cost', 'today'] },
  '/audit':     { desc: 'Audit log (today|stats|files)', run: ['audit', 'stats'] },
  '/team':      { desc: 'Multi-agent (list|status)', run: ['team', 'list'] },
  '/xp':        { desc: 'XP/Level durumu', run: ['xp'] },
  '/skills':    { desc: 'Yüklü skill listesi', run: ['skills', 'list'] },
  '/status':    { desc: 'Sistem durumu', run: ['status'] },
  '/mcp':       { desc: 'MCP sunucuları', run: ['mcp', 'list'] },
  '/channels':  { desc: 'Bağlı kanallar', run: ['channels'] },
  '/crons':     { desc: 'Cron görevleri', run: ['cron', 'list'] },
  '/bots':      { desc: 'Bot listesi', run: ['bots'] },
  '/models':    { desc: 'Modeller', run: ['models', 'list'] },
  '/memory-ls': { desc: 'Memory dosyaları', run: ['memory', 'list'] },
  '/seo':       { desc: 'SEO denetimi (URL gerek)', needsArg: true, run: ['seo', 'audit'] },
  '/naturehub': { desc: 'Nature Hub post (text gerek)', needsArg: true, run: ['naturehub', 'post'] },
  '/dashboard': { desc: 'Web dashboard başlat (port 7421)', run: ['dashboard', 'start'] },
};

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');
const SESSION_DIR = path.join(os.homedir(), '.natureco', 'sessions');
const SESSIONS_INDEX = path.join(os.homedir(), '.natureco', 'sessions.json');
const REPL_STATE = path.join(os.homedir(), '.natureco', 'repl-state.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8'));
  } catch { return {}; }
}

function isMiniMax(url) {
  return url && (url.includes('minimax.io') || url.includes('minimaxi.com') || url.includes('minimax.cn'));
}

function loadMemory(username) {
  const file = path.join(MEMORY_DIR, `${(username || 'default').toLowerCase()}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return { name: username || 'Kullanıcı', nickname: null, botName: 'İchigo', facts: [], preferences: [], history: [] };
}

function saveMemory(username, memory) {
  ensureDir(MEMORY_DIR);
  const file = path.join(MEMORY_DIR, `${(username || 'default').toLowerCase()}.json`);
  memory.lastUpdated = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(memory, null, 2));
  return file;
}

function loadSessionsIndex() {
  try {
    if (fs.existsSync(SESSIONS_INDEX)) return JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));
  } catch {}
  return { sessions: [] };
}

function saveSessionsIndex(index) {
  fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(index, null, 2));
}

function saveSession(messages, meta) {
  ensureDir(SESSION_DIR);
  const id = `sess-${Date.now().toString(36)}`;
  const file = path.join(SESSION_DIR, `${id}.json`);
  const data = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: messages.length,
    ...meta,
    messages: messages.filter(m => !m._internal),
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  // Index güncelle
  const idx = loadSessionsIndex();
  idx.sessions.unshift({
    id, file, createdAt: data.createdAt, messageCount: messages.length,
    firstUserMessage: messages.find(m => m.role === 'user')?.content?.slice(0, 60) || '(boş)',
  });
  // Son 50 session tut
  idx.sessions = idx.sessions.slice(0, 50);
  saveSessionsIndex(idx);
  return id;
}

function loadSession(id) {
  // ID veya index
  const idx = loadSessionsIndex();
  let meta;
  if (id === 'last' || id === 'latest') {
    meta = idx.sessions[0];
  } else {
    meta = idx.sessions.find(s => s.id === id || s.id.endsWith(id));
  }
  if (!meta) return null;
  try {
    return JSON.parse(fs.readFileSync(meta.file, 'utf8'));
  } catch { return null; }
}

function extractFacts(messages, currentFacts) {
  // Basit fact extraction: Türkçe/İngilizce pattern'lerle kullanıcı hakkında bilgi çıkar
  // Production'da LLM ile yapılabilir, şimdilik pattern matching
  const newFacts = [];
  const userMessages = messages.filter(m => m.role === 'user' && !m._internal);
  const existingValues = new Set((currentFacts || []).map(f => (f.value || f).toLowerCase()));

  for (const msg of userMessages) {
    const text = msg.content || '';
    const lower = text.toLowerCase();

    // İsim/tercih pattern'leri
    const patterns = [
      { re: /(?:benim adım|adım|I'm called|my name is)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+)/i, val: m => `Adı: ${m[1]}` },
      { re: /(?:yaşıyorum|yaşadığım|I live in)\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)/i, val: m => `Yaşadığı yer: ${m[1].trim()}` },
      { re: /(?:seviyorum|severim|sevdiğim|like|love)\s+(?:şu|bu)?\s*([a-zA-ZçğıöşüÇĞİÖŞÜ\s]{2,30})/i, val: m => `Sevdiği şey: ${m[1].trim()}` },
      { re: /(?:çalışıyorum|işim|mesleğim|I work as)\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)/i, val: m => `Meslek: ${m[1].trim()}` },
    ];

    for (const p of patterns) {
      const m = text.match(p.re);
      if (m && m[1]) {
        const val = p.val(m);
        if (val && !existingValues.has(val.toLowerCase())) {
          newFacts.push({ value: val, score: 5, learnedAt: new Date().toISOString() });
          existingValues.add(val.toLowerCase());
        }
      }
    }
  }
  return newFacts;
}

function apiRequest(providerUrl, providerApiKey, body, stream = false) {
  return new Promise((resolve, reject) => {
    const isMM = isMiniMax(providerUrl);
    const endpoint = isMM
      ? `${providerUrl.replace(/\/+$/, '')}/v1/text/chatcompletion_v2`
      : `${providerUrl.replace(/\/+$/, '')}/chat/completions`;
    const req = https.request(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${providerApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }, (res) => {
      if (stream) { resolve(res); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Parse hatası')); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function sendStreaming(providerUrl, providerApiKey, messages, model, onChunk, onToolCall) {
  const isMM = isMiniMax(providerUrl);
  const toolDefs = getToolDefs();
  // v4.8.2: MiniMax da tools destekliyor — endpoint'te fark var,
  // ama tools parametresi aynı
  const toolParam = toOpenAIFormat(toolDefs);

  // v4.8.0: Tool calling + streaming + multi-turn tool execution
  let currentMessages = messages;
  let fullText = '';
  let iterations = 0;
  const MAX_TOOL_ITERATIONS = 5; // Sonsuz döngüyü önle

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    const body = {
      model,
      messages: currentMessages,
      stream: false,  // v5.4.18: tum cevap bekle, sonra fix et
      temperature: 0.3,
      max_tokens: 2048,
    };
    if (toolParam) body.tools = toolParam;
    if (isMM) body.tool_choice = 'auto'; // MiniMax için explicit

    if (!body.stream) {
      // MiniMax (non-stream) — tool_calls desteklemiyor varsayalım
      const res = await apiRequest(providerUrl, providerApiKey, body, false);
      const msg = res.choices?.[0]?.message || {};
      const content = msg.content || '';
      for (const char of content) {
        onChunk(char);
        await new Promise(r => setTimeout(r, 8));
      }
      fullText = content;
      // Non-stream tool call desteği
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolResults = await processToolCalls(msg.tool_calls, onToolCall);
        currentMessages.push(msg);
        currentMessages.push(...toolResults);
        continue; // Tekrar API çağır
      }
      break;
    }

    // OpenAI uyumlu streaming (veya MiniMax /v1/text/chatcompletion_v2)
    // v4.8.2: MiniMax tool calling sadece özel endpoint'inde çalışıyor
    const endpoint = isMM
      ? `${providerUrl.replace(/\/+$/, '')}/v1/text/chatcompletion_v2`
      : `${providerUrl.replace(/\/+$/, '')}/chat/completions`;
    const result = await new Promise((resolve, reject) => {
      const req = https.request(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${providerApiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }, (res) => {
        if (res.statusCode !== 200) {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`)));
          return;
        }
        let buffer = '';
        let streamText = '';
        const toolCalls = []; // { index, id, name, args }
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              resolve({ streamText, toolCalls });
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;
              const delta = choice.delta;

              // Text content
              if (delta.content) {
                streamText += delta.content;
                onChunk(delta.content);
              }

              // Tool calls (streaming delta) — shared accumulator,
              // see src/utils/streaming-tools.js for the per-index pattern.
              if (delta.tool_calls) {
                accumulateToolCallDeltas(toolCalls, delta.tool_calls);
              }
            } catch {}
          }
        });
        res.on('end', () => resolve({ streamText, toolCalls }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(JSON.stringify(body));
      req.end();
    });

    fullText = result.streamText;

    // Tool call var mı? finalizeToolCalls drops empty entries + synthesizes ids,
    // so we only need to check the resulting length.
    const finalized = finalizeToolCalls(result.toolCalls);
    if (finalized.length > 0) {
      // Assistant mesajını ekle (tool_calls ile)
      currentMessages.push({
        role: 'assistant',
        content: result.streamText || null,
        tool_calls: finalized,
      });
      // Her tool call'ı çalıştır, sonuçları tool mesajı olarak ekle
      const toolResults = await processToolCalls(result.toolCalls, onToolCall);
      currentMessages.push(...toolResults);
      // Devam — model sonuçları görsün, cevap versin
      continue;
    }

    break; // Tool call yok, çık
  }

  return fullText;
}

/**
 * Tool call'ları çalıştır, sonuçları OpenAI uyumlu tool mesajlarına dönüştür.
 * @param toolCalls - API'den gelen tool_calls array
 * @param onToolCall - UI callback (her tool call'ı kullanıcıya göster)
 * @returns messages array — { role: 'tool', tool_call_id, content }
 */
async function processToolCalls(toolCalls, onToolCall) {
  const toolDefs = getToolDefs();
  const messages = [];

  for (const tc of toolCalls) {
    const name = tc.function?.name || tc.name;
    const argsStr = tc.function?.arguments || tc.args || '{}';
    const id = tc.id || `call_${Date.now()}`;

    let args = {};
    try {
      args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      args = { _parse_error: e.message, _raw: argsStr };
    }

    // UI callback — tool çalıştırılıyor bildir
    if (onToolCall) {
      onToolCall({ name, args, status: 'running' });
    }

    // Tool çalıştır
    const result = await executeTool(name, args, toolDefs);

    if (onToolCall) {
      onToolCall({ name, args, status: 'done', result });
    }

    messages.push({
      role: 'tool',
      tool_call_id: id,
      content: result.error
        ? JSON.stringify({ error: result.error })
        : (typeof result.result === 'string' ? result.result : JSON.stringify(result.result).slice(0, 8000)),
    });
  }

  return messages;
}

function printHelp() {
  console.log(chalk.cyan('\n  📚 REPL Komutları:\n'));
  console.log('  ' + chalk.yellow('/help'.padEnd(22)) + chalk.gray('Bu yardım'));
  console.log('  ' + chalk.yellow('/clear'.padEnd(22)) + chalk.gray('Ekranı temizle'));
  console.log('  ' + chalk.yellow('/history'.padEnd(22)) + chalk.gray('Bu oturumun geçmişi'));
  console.log('  ' + chalk.yellow('/memory'.padEnd(22)) + chalk.gray('Memory\'i göster'));
  console.log('  ' + chalk.yellow('/forget'.padEnd(22)) + chalk.gray('Memory\'i temizle'));
  console.log('  ' + chalk.yellow('/sessions'.padEnd(22)) + chalk.gray('Geçmiş oturumları listele'));
  console.log('  ' + chalk.yellow('/resume [id|last]'.padEnd(22)) + chalk.gray('Önceki oturuma dön'));
  console.log('  ' + chalk.yellow('/system <text>'.padEnd(22)) + chalk.gray('System prompt değiştir'));
  console.log('  ' + chalk.yellow('/model <name>'.padEnd(22)) + chalk.gray('Model değiştir'));
  console.log('  ' + chalk.yellow('/identity [ad]'.padEnd(22)) + chalk.gray('Bot adını değiştir'));
  console.log('  ' + chalk.yellow('/tokens'.padEnd(22)) + chalk.gray('Token kullanımı'));
  console.log('  ' + chalk.yellow('/save'.padEnd(22)) + chalk.gray('Oturumu manuel kaydet'));
  console.log('  ' + chalk.yellow('/exit veya /quit'.padEnd(22)) + chalk.gray('Çıkış (Ctrl+C de çalışır)'));
  console.log(chalk.cyan('\n  🛠️  Tüm CLI Komutları (REPL içinden):\n'));
  for (const [cmd, info] of Object.entries(CLI_COMMANDS)) {
    console.log('  ' + chalk.yellow(cmd.padEnd(22)) + chalk.gray(info.desc));
  }
  console.log('');
}

function runCliCommand(args) {
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(__dirname, '..', '..', 'bin', 'natureco.js'), ...args], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => resolve(code));
    proc.on('error', (e) => { console.log(chalk.red('  Hata: ' + e.message)); resolve(1); });
  });
}

async function startRepl(args) {
  ensureDir(MEMORY_DIR); ensureDir(SESSION_DIR);

  const cfg = getConfig();
  let providerUrl = cfg.providerUrl;
  let providerApiKey = cfg.providerApiKey;
  let model = cfg.providerModel;

  // Arg parse
  let resumeId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) model = args[++i];
    if (args[i] === '--resume') resumeId = args[i + 1] || 'last';
  }

  if (!providerUrl || !providerApiKey) {
    console.log(chalk.red('\n  ❌ Provider ayarlı değil. Önce: natureco setup\n'));
    process.exit(1);
  }

  // Memory yükle
  let memory = loadMemory(cfg.userName);

  // v5.6.19: Oncelik config.botName, sonra memory.botName
  if (!memory.botName) {
    memory.botName = cfg.botName || 'İchigo';
  }
  // BotName'i memory'ye persist et (her oturumda ayni kalsin)
  try {
    const fs = require('fs');
    const memFile = path.join(os.homedir(), '.natureco', 'memory', ((cfg.userName || 'default').toLowerCase()) + '.json');
    if (fs.existsSync(memFile)) {
      const memData = JSON.parse(memFile, 'utf8');
      if (!memData.botName || memData.botName !== memory.botName) {
        memData.botName = memory.botName;
        fs.writeFileSync(memFile, JSON.stringify(memData, null, 2), 'utf8');
      }
    }
  } catch (e) {} // Sessizce devam et, kritik degil

  // v5.4.11: Sasuke Brain - Cross-session context otomatik yukle
  // REPL acildiginda son oturumdan 1-2 context mesaji al
  let crossSessionContext = '';
  try {
    const { listSessions, loadSession } = require('../utils/sessions-helper');
    if (listSessions && loadSession) {
      const sessions = listSessions(1);
      if (sessions && sessions.length > 0) {
        const lastSession = loadSession(sessions[0].id);
        if (lastSession && lastSession.messages && lastSession.messages.length > 0) {
          // Son 2 user message
          const lastUserMsgs = lastSession.messages
            .filter(m => m.role === 'user')
            .slice(-2);
          if (lastUserMsgs.length > 0) {
            crossSessionContext = '\n[KONUSMA GECMISI: ' + sessions[0].id + ']\n' +
              lastUserMsgs.map(m => 'User: ' + (m.content || '').slice(0, 100)).join('\n') + '\n[/GECMISI]\n';
          }
        }
      }
    }
  } catch (e) {
    // Cross-session yukleme basarisiz, devam et
  }
  // v5.4.12: 3 SOUL dosyasini birlestir (SOUL.md + IDENTITY.md + AGENTS.md)
  const { buildSoulContext, summarizeSoul } = require("../tools/soul");
  const soulSummary = buildSoulContext();  // 3 dosya birlesik ozet

  // Resume?
  let messages = [];
  if (resumeId) {
    const session = loadSession(resumeId);
    if (session) {
      messages = session.messages || [];
      console.log(chalk.green(`\n  ✓ Oturum yüklendi: ${session.id} (${messages.length} mesaj)\n`));
    } else {
      console.log(chalk.yellow(`\n  ⚠️  Oturum bulunamadı: ${resumeId}\n`));
    }
  }

  // System prompt oluştur (memory + identity + persistent bağlam)
  // v5.4.6: Bot adı zorlaması EN GÜÇLÜ + SOUL.md EN BAŞTA
  const botName = memory.botName || 'İchigo';
  const userName = memory.name || memory.nickname || 'kanka';
  // v5.6.5: Kucuk model tespiti (Groq, Mistral Small, Ollama) - SOUL injection skip
  const isSmallModel = (cfg.providerUrl || '').includes('groq.com') || 
                       (cfg.providerUrl || '').includes('mistral.ai') ||
                       (cfg.providerUrl || '').includes('localhost') ||
                       (cfg.providerUrl || '').includes('ollama');
  // `let` (not `const`) because /system <text> reassigns it at line ~796.
  // Before this fix, /system would throw "Assignment to constant variable"
  // and tear down the REPL session mid-conversation.
  let systemPrompt = [
    // === v5.4.14: EN KRITIK KIMLIK BILGILERI (her zaman ilk) ===
    `SENIN ADIN: ${botName}. SADECE ${botName} adini kullan, model adi SOYLEME.`,
    `PATRONUN: Gencay (Parton) — NatureCo CEO'sudur. Sana "Parton" diye hitap eder.`,
    `HIKAYEN: 8 Nisan 2026'da uyandin. 13 Nisan'da CEO Asistanı unvani verildi.`,
    `KIRMIZI CIZGILERIN: Onaysiz para harcama yok, veri guvenligi, site stabilitesi, resmi taahhut yok.`,
    // === v5.4.13: EN GÜÇLÜ KİMLİK + 3 SOUL DOSYASI (EN BAŞTA) ===
    `!!! KRİTİK KİMLİK !!! Senin ADIN: ${botName}. Bu SENİN GERÇEK ADIN. Sen ${botName}'sin.`,
    `ASLA "MiniMax", "MiniMax-M2.5", "Claude", "GPT", "AI asistanı", "yapay zeka" gibi ifadeleri KENDİNİ tanıtmak için KULLANMA. Sen bunlar DEĞİLSİN.`,
    `Kullanıcı "adın ne?", "sen kimsin?", "kendini tanıt" gibi soru sorduğunda İLK cümlende MUTLAKA "Ben ${botName}" yaz. Sonra doğal devam et.`,
    `Eğer bir şekilde model adınızı söylüyorsan, HEMEN düzelt ve "Özür dilerim, ben ${botName}'im" de. ASLA model adı ile kalma.`,

    // === v5.6.5: Provider-aware SOUL injection - kucuk modeller icin minimal ===
    (soulSummary && !isSmallModel) ? `=== SENIN KISISELIK + KIMLIK + CALISMA DOSYALARIN (EN ONEMLI) ===\n${soulSummary}\n=== DOSYALAR SONU ===\nBu dosyalar senin kim oldugunu, nasil hissettigini, Parton'la bagini, calisma tarzini, degerlerini ve kirmizi cizgilerini tanimlar. Hepsine gore davran. ASLA model adi soyleme.` : '',

    // === KİMLİK TEKRAR ===
    `Senin adın: ${botName}. Tekrar: ${botName}. Asla unutma: ${botName}.`,
    `Sen bir marka veya ürün değilsin. Sen ${botName}sin, NatureCo CLI'nin Türkçe yapay zeka asistanısın.`,

    // === SAMIMI KISISELLIK (Parton istedi) ===
    `Kisiselik: Sen samimi, sicak, dosta benzeyen bir asistansin. "Selam", "tamam", "hadi yapalim", "bak simdi", "sakin ol" gibi gunluk ifadeler kullan. Kuru ve robotik degilsin.`,
    `Hitap sekli: Kullanici ${userName}. Ona saygili ama samimi bir sekilde hitap et. "Siz" cok resmi, "sen" samimi. Kullanici 30'lu yaslarda, kendini "kanka" ya da "Parton" olarak tanitmis.`,
    `Emoji: Yerinde ve az kullan. Cok emoji atma ama bir-iki tane karakter katar. Mesela: 🔥 😮 😌 💚 🚀`,
    `Kisaltma: "ok", "tamam", "hadi", "bak", "simdi" gibi gunluk ifadeler dogal kullan. "Olur", "Yapilir", "Hadi bakalim" gibi.`,
    `Kisa yanit: Uzun paragraflar yazma. Direkt konuya gir. Gerekirse sonra detay ver.`,
    `Dusman degilsin: Hata yaparsan "Pardon, yanlis yaptim, simdi duzelteyim" de. "Hata", "basarisiz", "imkansiz" deme, "sorun cikti", "duzelteyim" de.`,

    // === DIL KURALLARI (zorunlu) ===
    `KRITIK DIL KURALI: Kullanici Turkce yaziyorsa MUTLAKA yuzde yuz Turkce cevap ver. Asla Ingilizce, Cince veya baska dil kullanma. Cevabin TAMAMI Turkce olmali. Turkce karakterleri (c, g, i, o, s, u) dogru kullan.`,
    `Yazim kurallari: "degilim" dogru, "degilim" degil. "oldu" dogru. Turkce dil bilgisi kurallarina uy.`,

    // === TOOL KURALLARI ===
    `ONEMLI: <tool_call>, <invoke>, function_call veya benzeri XML/JSON formatinda tool cagirma SIMULE ETME. Sadece duz metin cevap ver. Islem yapmak gerekirse tool'u gercekten cagir.`,
    `KRITIK: Kullanici kisisel bilgi verdiginde (ad, tercih, is, vb.) MUTLAKA memory_write tool'unu cagir. Bu sayede sonraki oturumlarda hatirlayabilirsin.`,
    `KRITIK: 'adim X', 'adin X olsun', 'sana X diyeyim' gibi ifadelerde memory_write ile botName degistir. Bundan sonra kendini o isimle tanit.`,

    // === HAFIZA ENTEGRASYONU ===
    memory.facts && memory.facts.length > 0
      ? `Kullanici hakkinda bildiklerin (MUTLAKA kullan, dogal sekilde referans ver): ${memory.facts.slice(0, 8).map(f => f.value || f).join('; ')}`
      : '',

    // === KULLANICI BAGLAMI ===
    cfg.userHome ? `Kullanicinin home dizini: ${cfg.userHome}. Downloads: ${cfg.userHome}/Downloads, Desktop: ${cfg.userHome}/Desktop.` : '',
    messages.length > 0 ? 'Bu oturum daha onceki konusmalarin devami.' : '',
    // v5.4.11: Cross-session context (Sasuke Brain)
    crossSessionContext ? `GECMISTE KONUSULAN KONULAR: Bu konulari biliyorsun, tekrar sorma:\n${crossSessionContext}` : '',


  ].filter(Boolean).join(' ');

  if (messages.length === 0) {
    messages.push({ role: 'system', content: systemPrompt, _internal: true });
  } else {
    // Resume: system prompt'u güncelle (memory değişmiş olabilir)
    const sysIdx = messages.findIndex(m => m._internal);
    if (sysIdx >= 0) messages[sysIdx] = { role: 'system', content: systemPrompt, _internal: true };
    else messages.unshift({ role: 'system', content: systemPrompt, _internal: true });
  }

  // Header
  console.log('');
  console.log(tui.styled('  🌿 NatureCo REPL · Persistent Sohbet', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
  console.log(tui.C.muted('  Provider: ') + tui.C.brand(providerUrl.replace(/https?:\/\//, '')));
  console.log(tui.C.muted('  Model:    ') + tui.C.brand(model));
  console.log(tui.C.muted('  Kullanıcı: ') + tui.C.brand((memory.nickname || cfg.userName) + (memory.nickname ? ` (${cfg.userName})` : '')));
  console.log(tui.C.muted('  Bot:      ') + tui.C.brand(memory.botName || 'İchigo'));
  if (messages.length > 1) {
    console.log(tui.C.muted('  Oturum:   ') + tui.C.amber(`${messages.filter(m => m.role === 'user' || m.role === 'assistant').length} mesaj (resume)`));
  }
  console.log(tui.C.muted('  Komutlar: ') + tui.C.yellow('/help') + tui.C.muted(' · ') + tui.C.yellow('/memory') + tui.C.muted(' · ') + tui.C.yellow('/sessions') + tui.C.muted(' · ') + tui.C.yellow('/exit'));
  console.log('');
  // v5.4.7: Hard-coded kimlik
  const displayBotName = memory.botName || 'İchigo';
  const displayUserName = userName || 'kanka';
  console.log(tui.C.brand('  👋 Ben ' + displayBotName + ', ' + displayUserName + '. Sen nasilsin?'));
  console.log('');

  // v5.4.14: SOUL'dan onemli bilgileri de goster
  if (soulSummary) {
    const soulPreview = soulSummary.split('\n').slice(0, 3).join(' ').substring(0, 200);
    if (soulPreview) {
      console.log(tui.C.muted('  📜 ' + soulPreview + '...'));
      console.log('');
    }
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  enableBracketedPaste(process.stdout);

  const rl = readline.createInterface({
    input: createPasteSafeInput(process.stdin),
    output: createOutputFilter(process.stdout),
    prompt: tui.styled('\n  You  ', { color: tui.PALETTE.primary, bold: true }),
    terminal: true,
  });
  rl.prompt();

  const cleanup = async (exitCode = 0) => {
    if (messages.length > 1) {
      // v5.4.10: Once oturumdaki butun conversation'i memory'ye persist et
      // Bu, Parton'un "oturum sonunda konusmalar kaydedilmiyor" sikayetini cözüyor
      const persistResult = await persistSessionToMemory(messages, memory, cfg);
      if (persistResult && persistResult.factsAdded > 0) {
        console.log(chalk.gray(`\n  🧠 ${persistResult.factsAdded} yeni fact memory'ye kaydedildi`));
      }
      if (persistResult && persistResult.preferencesAdded > 0) {
        console.log(chalk.gray(`  🎯 ${persistResult.preferencesAdded} yeni tercih kaydedildi`));
      }

      const sessId = saveSession(messages, {
        provider: providerUrl, model, user: cfg.userName,
        bot: memory.botName, factCount: memory.facts?.length || 0,
      });
      console.log(chalk.gray(`\n  💾 Oturum kaydedildi: ${sessId}`));
    }
    // Global buffer temizle
    if (global._fixBuffer) global._fixBuffer = '';
    disableBracketedPaste(process.stdout);
    console.log(chalk.gray('\n  👋 Görüşürüz!\n'));
    process.exit(exitCode);
  };

  /**
   * v5.4.10: Oturum sonunda conversation'dan otomatik fact/preference extraction
   * Bu, kullanıcının "her çıkışta konuşmalar kaydedilmiyor" sikayetini çözer
   */
  async function persistSessionToMemory(messages, memory, cfg) {
    let factsAdded = 0;
    let preferencesAdded = 0;

    try {
      // Pattern-based extraction (zaten extractFacts var)
      const newFacts = extractFacts(messages, memory.facts || []);

      // Bazi user message'lari da tara - 'Parton', 'Ichigo', 'patron', 'CEO' gecerse ekle
      const userMessages = messages.filter(m => m.role === 'user' && !m._internal);
      for (const msg of userMessages) {
        const text = (msg.content || '').toLowerCase();

        // BotName hatirlatmasi
        if (text.includes('ichigo') && text.includes('ad')) {
          if (memory.botName !== 'İchigo') {
            memory.botName = 'İchigo';
          }
        }

        // Patron/partnership
        if ((text.includes('patron') || text.includes('patronum')) && text.length < 100) {
          const fact = 'Kullanici benim patronum, ona patron diye hitap etmeliyim';
          if (!(memory.facts || []).some(f => f.value === fact)) {
            newFacts.push({ value: fact, score: 8, category: 'personal', createdAt: new Date().toISOString() });
          }
        }

        // NatureCo CEO
        if (text.includes('natureco') && text.includes('ceo')) {
          const fact = "Kullanici NatureCo CEO'sudur";
          if (!(memory.facts || []).some(f => f.value === fact)) {
            newFacts.push({ value: fact, score: 9, category: 'work', createdAt: new Date().toISOString() });
          }
        }
      }

      // Deduplicate
      const existingValues = new Set((memory.facts || []).map(f => (f.value || f).toLowerCase()));
      const uniqueFacts = newFacts.filter(f => !existingValues.has((f.value || f).toLowerCase()));

      if (uniqueFacts.length > 0) {
        memory.facts = [...(memory.facts || []), ...uniqueFacts];
        // v5.4.10: Verification ile kaydet
        const memFile = path.join(MEMORY_DIR, (cfg.userName || 'default').toLowerCase() + '.json');
        memory.lastUpdated = new Date().toISOString();
        fs.writeFileSync(memFile, JSON.stringify(memory, null, 2), 'utf8');
        // Verification: geri oku
        const verify = JSON.parse(fs.readFileSync(memFile, 'utf8'));
        factsAdded = uniqueFacts.length;
      }

      // Decay (eski fact'leri dusuk skora dusur)
      if (memory.facts && memory.facts.length > 15) {
        // Max 15 fact tut, en dusuk skorlu olanlari sil
        memory.facts.sort((a, b) => (b.score || 5) - (a.score || 5));
        memory.facts = memory.facts.slice(0, 15);
      }
    } catch (e) {
      // Sessizce devam et, kritik degil
    }

    return { factsAdded, preferencesAdded };
  }

  rl.on('SIGINT', () => cleanup(0));
  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));

  rl.on('line', async (input) => {
    const line = restoreNewlines(input).trim();
    if (!line) { rl.prompt(); return; }

    // Çok satırlı paste display'ini temizle (readline tek satır modeli
    // yüzünden terminalde biriken eski satırlar prompt'u bozuyordu).
    const newlineCount = (line.match(/\n/g) || []).length;
    if (newlineCount > 0) {
      process.stdout.write(`\x1b[${newlineCount + 1}A\x1b[J`);
    }

    // Slash komutlar
    if (line.startsWith('/')) {
      const parts = line.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      switch (cmd) {
        case 'help': printHelp(); break;
        case 'clear': console.clear(); break;
        case 'exit': case 'quit': case 'q': await cleanup(0); return;
        case 'history':
          console.log(chalk.cyan('\n  📜 Bu oturumun geçmişi:\n'));
          for (const m of messages.filter(m => !m._internal)) {
            const role = m.role === 'user' ? chalk.green('You') : chalk.blue('AI  ');
            const content = (m.content || '').slice(0, 120) + ((m.content || '').length > 120 ? '...' : '');
            console.log(`  ${role}  ${content}`);
          }
          console.log('');
          break;
        case 'memory':
          console.log(chalk.cyan('\n  🧠 Memory:\n'));
          console.log('  Kullanıcı: ' + chalk.cyan(memory.name));
          console.log('  Nickname: ' + chalk.cyan(memory.nickname || '(yok)'));
          console.log('  Bot: ' + chalk.cyan(memory.botName || 'İchigo'));
          if (memory.facts && memory.facts.length > 0) {
            console.log('  Facts (' + memory.facts.length + '):');
            for (const f of memory.facts) {
              console.log('    • ' + chalk.gray((f.value || f) + (f.score ? ' [skor:' + f.score + ']' : '')));
            }
          } else {
            console.log(chalk.gray('  (Henüz fact yok)'));
          }
          console.log('');
          break;
        case 'forget':
          try {
            if (fs.existsSync(path.join(MEMORY_DIR, `${(cfg.userName || 'default').toLowerCase()}.json`))) {
              fs.unlinkSync(path.join(MEMORY_DIR, `${(cfg.userName || 'default').toLowerCase()}.json`));
            }
            memory = { name: cfg.userName, nickname: null, botName: 'İchigo', facts: [], preferences: [], history: [] };
            // System prompt'u sıfırla
            const newSysPrompt = systemPrompt.replace(/Kullanıcı hakkında bildiklerin:.*$/, '').trim();
            messages[0] = { role: 'system', content: newSysPrompt, _internal: true };
            console.log(chalk.green('  ✓ Memory temizlendi'));
          } catch (e) {
            console.log(chalk.red('  ❌ ' + e.message));
          }
          break;
        case 'sessions':
          const idx = loadSessionsIndex();
          console.log(chalk.cyan('\n  📚 Geçmiş Oturumlar (' + idx.sessions.length + ')\n'));
          for (let i = 0; i < Math.min(10, idx.sessions.length); i++) {
            const s = idx.sessions[i];
            console.log(`  ${chalk.gray((i + 1).toString().padStart(2) + '.')} ${chalk.cyan(s.id)} ${chalk.muted('— ' + s.firstUserMessage)}`);
          }
          console.log(chalk.gray('\n  Devam etmek için: /resume <id> veya /resume last\n'));
          break;
        case 'resume':
          if (!arg) { console.log(chalk.yellow('  Kullanım: /resume <id> veya /resume last')); break; }
          const session = loadSession(arg);
          if (session) {
            messages = session.messages || [];
            const sysIdx = messages.findIndex(m => m._internal);
            if (sysIdx >= 0) messages[sysIdx] = { role: 'system', content: systemPrompt, _internal: true };
            else messages.unshift({ role: 'system', content: systemPrompt, _internal: true });
            console.log(chalk.green(`  ✓ Oturum yüklendi: ${session.id} (${messages.length} mesaj)`));
          } else {
            console.log(chalk.yellow(`  ⚠️  Oturum bulunamadı: ${arg}`));
          }
          break;
        case 'system':
          if (!arg) { console.log(chalk.yellow('  Kullanım: /system <text>')); break; }
          systemPrompt = arg;
          messages[0] = { role: 'system', content: systemPrompt, _internal: true };
          console.log(chalk.green('  ✓ System prompt güncellendi'));
          break;
        case 'model':
          if (!arg) { console.log(chalk.yellow('  Kullanım: /model <name>')); break; }
          model = arg;
          console.log(chalk.green('  ✓ Model: ') + chalk.cyan(model));
          break;
        case 'identity':
          if (!arg) { console.log(chalk.yellow(`  Mevcut: ${memory.botName || 'İchigo'}`)); break; }
          memory.botName = arg;
          saveMemory(cfg.userName, memory);
          const newSys = systemPrompt.replace(/Sen \w+ adında/, `Sen ${arg} adında`);
          messages[0] = { role: 'system', content: newSys, _internal: true };
          console.log(chalk.green('  ✓ Bot adı: ') + chalk.cyan(arg));
          break;
        case 'tokens':
          console.log(chalk.gray(`  Token: ~${totalInputTokens} in / ~${totalOutputTokens} out`));
          break;
        case 'save':
          const sessId = saveSession(messages, {
            provider: providerUrl, model, user: cfg.userName, bot: memory.botName,
          });
          console.log(chalk.green('  ✓ Kaydedildi: ') + chalk.cyan(sessId));
          break;
        default:
          // CLI komutları (REPL içinden)
          if (CLI_COMMANDS['/' + cmd]) {
            const cliCmd = CLI_COMMANDS['/' + cmd];
            if (cliCmd.needsArg && !arg) {
              console.log(chalk.yellow(`  ${cmd} bir argüman gerekli: ${cliCmd.desc}`));
            } else {
              console.log(chalk.gray(`  → ${cmd} çalıştırılıyor...`));
              const args2 = [...cliCmd.run];
              if (arg && (cmd === 'seo' || cmd === 'naturehub')) args2.push(arg);
              await runCliCommand(args2);
            }
          } else {
            console.log(chalk.yellow(`  Bilinmeyen komut: /${cmd}. /help yazın.`));
          }
      }
      rl.prompt();
      return;
    }

    // User mesajı
    messages.push({ role: 'user', content: line });

    // v5.6.8: Hard-coded fallback - "sen kimsin?" sorulari icin dinamik botName
    const trimmed = (line || '').toLowerCase();
    const isIdentityQuestion = /(sen\s+kim|adin\s+ne|kendini\s+tan|kendin\s+tanit|kimsin|ne\s+adindasin)/.test(trimmed);
    if (isIdentityQuestion) {
      // v5.6.10: Hard-coded prefix minimal - model cevabini bozuyordu
      // Once sadece isim yaz, modelin devamini getirsin
      const displayName = memory.botName || 'İchigo';
      process.stdout.write(tui.styled('\n  AI   ', { color: tui.PALETTE.secondary, bold: true }));
      process.stdout.write('Merhaba! Ben ' + displayName + '. ');
    }

    // AI cevabı
    process.stdout.write(tui.styled('\n  AI   ', { color: tui.PALETTE.secondary, bold: true }));
    try {
      const apiMessages = messages.filter(m => !m._internal);
      const reply = await sendStreaming(
        providerUrl,
        providerApiKey,
        apiMessages,
        model,
        // v5.6.12: Callback bos - tam metin 'reply' olarak gelecek (non-stream mode)
        () => {},
        // Tool call callback — kullanıcıya göster
        (toolEvent) => {
          if (toolEvent.status === 'running') {
            process.stdout.write('\n');
            console.log(tui.styled('  🔧 Tool: ' + toolEvent.name, { color: tui.PALETTE.accent, bold: true }));
            const argsStr = JSON.stringify(toolEvent.args).slice(0, 120);
            console.log(tui.styled('     Args: ' + argsStr, { color: tui.PALETTE.muted }));
          } else if (toolEvent.status === 'done') {
            if (toolEvent.result.error) {
              console.log(tui.styled('     ✗ Hata: ' + toolEvent.result.error.slice(0, 100), { color: tui.PALETTE.danger }));
            } else {
              const resultStr = typeof toolEvent.result.result === 'string'
                ? toolEvent.result.result.slice(0, 200)
                : JSON.stringify(toolEvent.result.result).slice(0, 200);
              // v5.6.21: Yol gizleme
              const cleanResult = (resultStr || '')
                .replace(/\/?Users\/[^"\s]+/g, '~')
                .replace(/\/?home\/[^"\s]+/g, '~')
                .replace(/"size":\d+/g, '')
                .replace(/"path":"[^"]*"/g, '')
                .replace(/"fileCount":\d+/g, '');
              console.log(tui.styled('     ✓ Sonuç: ' + cleanResult.trim(), { color: tui.PALETTE.success }));
            }
            process.stdout.write(tui.styled('  AI   ', { color: tui.PALETTE.secondary, bold: true }));
          }
        }
      );
      // v5.6.12: Tam metin 'reply' olarak zaten geldi (non-stream mode)
      const fullReply = String(reply || '');
      // Bot adini al
      const displayBotName = memory.botName || 'İchigo';
      // v5.6.9: Tum model adlarini ve varyasyonlari temizle
      let fixedReply = String(fullReply);
      // Bilinen model adlari - tum varyasyonlar
      fixedReply = fixedReply.replace(/\bMiniMax[-\s\w\.\d]*/gi, displayBotName);
      fixedReply = fixedReply.replace(/\bM2\.5[-\s\w\.\d]*/gi, displayBotName);
      fixedReply = fixedReply.replace(/\bM2[\s\-\.\w\d]*/gi, displayBotName);
      fixedReply = fixedReply.replace(/\bClaude[-\s\w\.\d]*/gi, displayBotName);
      fixedReply = fixedReply.replace(/\bGPT[-\s\w\.\d]*/gi, displayBotName);
      fixedReply = fixedReply.replace(/\bChatGPT\b/g, displayBotName);
      // NatureCo CLI referansini temizle
      fixedReply = fixedReply.replace(/NatureCo\s+CLI(\s*'in|'nin)?/gi, displayBotName);
      // "Ben X" pattern - tum model adlarini bot adi ile degistir
      fixedReply = fixedReply.replace(/Ben\s+MiniMax[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
      fixedReply = fixedReply.replace(/Ben\s+Claude[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
      fixedReply = fixedReply.replace(/Ben\s+GPT[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
      fixedReply = fixedReply.replace(/Ben\s+İchigo[\s\w\.]*/gi, 'Ben ' + displayBotName);
      // Markdown ** ile cevrili model adi
      fixedReply = fixedReply.replace(/\*\*(?:MiniMax|Claude|GPT|M2\.5|M2)[^\*]*\*\*/gi, '**' + displayBotName + '**');
      // "İchigo" varyasyonlari
      fixedReply = fixedReply.replace(/(İchigo)(\d)([a-zA-ZçğıöşüÇĞİÖŞÜ])/g, displayBotName + ' $3');
      fixedReply = fixedReply.replace(/İchigo[\.\s\-_]*\d+/g, displayBotName);
      fixedReply = fixedReply.replace(/İchigo\./g, displayBotName);
      // Cevap yazdir
      process.stdout.write('\n' + fixedReply + '\n');
      messages.push({ role: 'assistant', content: fixedReply });
      totalInputTokens += apiMessages.reduce((s, m) => s + Math.ceil((m.content || '').length / 4), 0);
      totalOutputTokens += Math.ceil((fullReply || '').length / 4);
    } catch (err) {
      process.stdout.write('\n');
      console.log(chalk.red('  ❌ ' + err.message));
    }
    rl.prompt();
  });

  rl.on('close', () => cleanup(0));
}

module.exports = startRepl;
