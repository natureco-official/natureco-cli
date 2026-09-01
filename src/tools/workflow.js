const { istemciSec } = require('../utils/http-secici');
const fs = require('fs');
const path = require('path');
const { executeThroughGateway } = require('../utils/tool-execution-gateway');
const { loadToolManifest } = require('../utils/tool-manifest');
const os = require('os');
const { foldTr } = require('../utils/tr-text');

const WORKFLOW_DIR = path.join(os.homedir(), '.natureco', 'workflows');
const WORKFLOW_HISTORY = path.join(os.homedir(), '.natureco', 'workflow-history.json');

const { buildSkillIndex } = require('../utils/skill-index');

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
// Ortak ayar modülü üzerinden okunur. Dosyayı doğrudan okumak, çalışma anında
// doğan sağlayıcıları (ör. abonelik köprüsü) GÖRMEZ: köprü kipinde burada hâlâ
// 'abonelik:codex' yazar ve istek `Protocol "abonelik:" not supported` ile
// düşer — ölçülen hata buydu.
function loadConfig() { return require('../utils/config').getConfig(); }
function isMiniMax(url) { return url && (url.includes('minimax.io') || url.includes('minimaxi.com') || url.includes('minimax.cn')); }
function isGemini(url) { return url && (url.includes('generativelanguage.googleapis.com') || url.includes('gemini')); }

function allToolNames() {
  return Array.from(loadToolManifest().keys());
}

function loadUserMemory(username) {
  try {
    const dir = path.join(os.homedir(), '.natureco', 'memory');
    const uname = foldTr(username || 'default');
    // Kullanici-ozel dosya (`<user>.json`) + legacy `default.json`'i birlestir.
    // Eski kurulumlarda hafiza default.json'a yazilmis olabilir; okuyucu sadece
    // <user>.json'a bakinca eski kayitlar (ve bot personasi) hic yuklenmiyordu.
    // default.json'i yalnizca ismi aktif kullaniciyla eslesiyorsa (ya da isimsizse)
    // katariz — coklu kullanicida baska birinin hafizasini sizdirmamak icin.
    const files = [];
    const userFile = path.join(dir, `${uname}.json`);
    if (fs.existsSync(userFile)) files.push(userFile);
    if (uname !== 'default') {
      const defFile = path.join(dir, 'default.json');
      if (fs.existsSync(defFile)) {
        try {
          const dm = JSON.parse(fs.readFileSync(defFile, 'utf8'));
          const dn = foldTr(dm.name || '');
          if (!dn || dn === uname) files.push(defFile);
        } catch {}
      }
    }
    if (files.length === 0) return '';

    const seen = new Set();
    const facts = [];
    let name = '', botName = '';
    for (const file of files) {
      let mem;
      try { mem = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
      if (!name && mem.name) name = mem.name;
      // Jenerik "Asistan" placeholder yerine gercek persona adini tercih et
      if ((!botName || /^asistan$/i.test(botName)) && mem.botName && !/^asistan$/i.test(mem.botName)) botName = mem.botName;
      for (const f of (mem.facts || [])) {
        const v = (f && (f.value != null ? f.value : f));
        if (!v || typeof v !== 'string') continue;
        const key = foldTr(v.trim());
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // v5.40: skor + tarih koru — sysMsg'e EN GUNCEL/ONEMLI fact'ler girsin.
        // Eski hali dosya sirasiyla ilk 15'i aliyordu → cok fact olunca en YENI
        // kayit (or. yeni ogrenilen kod adi) kesiliyor, recall basarisiz oluyordu.
        facts.push({ v: v.trim(), score: (f && typeof f.score === 'number') ? f.score : 0, t: (f && (f.updatedAt || f.createdAt)) || '' });
      }
    }
    // v5.40: yuksek skor + en yeni once
    facts.sort((a, b) => (b.score - a.score) || String(b.t).localeCompare(String(a.t)));
    const factVals = facts.map(f => f.v);
    // isim memory.name'de yoksa fact'lerden cikar
    if (!name) {
      for (const f of factVals) {
        const match = foldTr(f).match(/(?:kullanici\s*adi?|kullanıcı\s*adı?|isim|name)\s*:?\s*(.+)/);
        if (match && match[1].trim().length > 2) { name = match[1].trim(); break; }
      }
    }
    const parts = [];
    if (name) parts.push(`Kullanici adi: ${name}`);
    if (botName) parts.push(`Bot adi: ${botName}`);
    if (factVals.length > 0) parts.push(`Bilinenler: ${factVals.slice(0, 25).join('; ')}`);
    return parts.join('\n');
  } catch {}
  return '';
}

function memoryContext() {
  const cfg = loadConfig();
  return loadUserMemory(cfg.userName);
}

function apiCall(providerUrl, apiKey, body) {
  return new Promise((resolve, reject) => {
    const base = providerUrl.replace(/\/+$/, '');
    const endpoint = isMiniMax(base)
      ? base + '/v1/text/chatcompletion_v2'
      : isGemini(base)
        ? base + '/openai/chat/completions'
        : base + '/chat/completions';
    const req = istemciSec(endpoint).request(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse hatasi')); }
        } else if (res.statusCode === 429) {
          reject(new Error('429: API rate limit. Bekleyip tekrar deneyin.'));
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Streaming (SSE) varyanti — onDelta(token) canli cagirilir; sonunda {content, toolCalls} doner.
// OpenAI-uyumlu delta formati (MiniMax chatcompletion_v2, Gemini /openai, OpenAI, ...).
function apiCallStream(providerUrl, apiKey, body, onDelta) {
  return new Promise((resolve, reject) => {
    const base = providerUrl.replace(/\/+$/, '');
    const endpoint = isMiniMax(base)
      ? base + '/v1/text/chatcompletion_v2'
      : isGemini(base)
        ? base + '/openai/chat/completions'
        : base + '/chat/completions';
    const req = istemciSec(endpoint).request(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 300))));
        return;
      }
      res.setEncoding('utf8');
      let sseBuf = '';
      let content = '';
      const toolCalls = [];
      res.on('data', (chunk) => {
        sseBuf += chunk;
        const parts = sseBuf.split('\n');
        sseBuf = parts.pop(); // eksik son satiri buffer'da tut
        for (const line of parts) {
          const l = line.trim();
          if (!l.startsWith('data:')) continue;
          const payload = l.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.content) { content += delta.content; if (onDelta) onDelta(delta.content); }
            if (Array.isArray(delta.tool_calls)) { for (const tc of delta.tool_calls) toolCalls.push(tc); }
          } catch { /* eksik/parcali JSON — atla */ }
        }
      });
      res.on('end', () => resolve({ content, toolCalls }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function workflow(params) {
  const { action, task, steps, name, workflowId, regenerateStep, conversationHistory } = params;
  const cfg = loadConfig();
  const tools = allToolNames();
  ensureDir(WORKFLOW_DIR);

  const providerUrl = cfg.providerUrl;
  const providerApiKey = cfg.providerApiKey;
  const model = cfg.providerModel || 'default';

  if ((action === 'run' || action === 'plan') && (!providerUrl || !providerApiKey)) {
    return { success: false, error: 'Provider ayarli degil. Once: natureco setup' };
  }

  const skillsIndexBlock = buildSkillIndex();

  // Build chat messages with optional conversation history for context
  function chatMessages(sysMsg, userTask) {
    const msgs = [{ role: 'system', content: sysMsg }];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const m of conversationHistory) {
        if (m._internal) continue;
        msgs.push({ role: m.role, content: m.content || '' });
      }
    }
    msgs.push({ role: 'user', content: userTask });
    return msgs;
  }

  // Non-tool-calling model tespiti
  // Tek kaynak: utils/provider-detect.js. Onceden burada satir-ici bir liste
  // vardi ve MiniMax'i tumden disliyordu; M2.5 native tool_calls uretiyor, bu
  // yuzden kontrol artik model-farkindadir (bkz. supportsNativeToolCalls).
  function supportsToolCalls() {
    const { supportsNativeToolCalls } = require('../utils/provider-detect');
    return supportsNativeToolCalls(providerUrl, model, cfg);
  }

  // ── RUN: Execute a complete workflow ──────────────────────────────────
  if (action === 'run') {
    if (!task) return { success: false, error: 'task gerekli' };

    // Non-tool-calling / agentic-text modeller (MiniMax M2.x): model tool call'larini
    // native XML olarak (<invoke> / <minimax:tool_call>) ve skill yuklemeyi <skill> ile
    // uretir. Bounded agentic dongu ile parse edip gercek araclari calistir.
    if (!supportsToolCalls()) {
      const { runAgentic } = require('./agentic-runner');
      const memCtx = memoryContext();
      const desktop = path.join(os.homedir(), 'Desktop');
      const memUser = cfg.userName || 'default';
      // Theseus deseni: oturum basinda hafiza agacini PROAKTIF yukle (on-demand aramaya
      // guvenme). Digest = kayitli bilgiler (icerik); Index = yapi (kok→dal).
      let treeIndex = '', treeDigest = '';
      try { const mt = require('./memory_tree')._internal; treeDigest = mt.buildDigest(memUser); treeIndex = mt.buildIndex(memUser); } catch {}
      // Tam mod (sahibin opt-in'i): tum arac+skill'ler acilir, keyfi shell (yikici haric).
      const execFull = cfg.agentExec === 'full' || cfg.computerUse === true || String(process.env.NATURECO_AGENT_EXEC || '').toLowerCase() === 'full';
      let fullToolsBlock = '';
      if (execFull) {
        const allNames = tools.filter(t => t !== 'workflow');
        fullToolsBlock = [
          '\n\nTAM MOD ACIK — su araclara da ERISIMIN VAR; o an ne gerekiyorsa dogrudan cagir:',
          '- mac_app_open: macOS uygulamasi ac. parametre: appName (orn. "WhatsApp", "Google Chrome", "Spotify")',
          '- mac_app_quit: macOS uygulamasi kapat. parametre: appName',
          '- browser: kalici Chrome/Chromium ajani; varsayilan GORUNUR ve login/storage korur. Sira: open(url) → snapshot → snapshot\'taki @e ref ile click/fill → tekrar snapshot ile dogrula. action=open|snapshot|click|fill|type|press|text|current_url|screenshot|html|evaluate|close.',
          '- browser_use: ayri bulut/CLI tarayici servisi; yalniz kurulu ve hazirsa kullan. Acik Chrome penceresini kontrol etmek icin kullanma.',
          '- computer_use: GUI otomasyonu. parametreler: action ("screenshot"/"click"/"type"/"keypress"/"scroll"), x, y, text, key',
          '- computer_use_loop: GORUNUR, cok-adimli GUI icin TEK tercih. p: goal, maxSteps?. Kendi screenshot→vision→action→dogrulama dongusunu yapar.',
          '- social_open: muzik/video/sosyal ac. parametreler: query, platform (spotify/youtube...)',
          '- macos_screenshot: ekran goruntusu al',
          '\nTARAYICI SECIMI: Kullanici "Chromium/tarayici ajani" derse kalici `browser` kullan. "Su anda acik olan kendi Chrome pencerem" derse yalniz `computer_use_loop` kullan; ayri browser profili acma. Muzik/video yalniz acilacaksa dogrudan URL\'yi `open` ile ac.',
          '\nTum arac listesi (isimle cagir; parametre yanlissa <tool_results> duzeltir): ' + allNames.join(', '),
        ].join('\n');
      }
      // Oz-bilgi: ajan "kac skill'in/aracin var, nerede kayitli" sorularinda dosya
      // sistemini kesfe cikip YANLIS sayiyordu (~/.natureco/skills yalniz kullanici
      // skill'leridir; yerlesikler paketin icindedir). Gercek sayilari ve konumlari
      // sistem mesajina gomuyoruz ki ajan kendi kurulumunu dogru anlatsin.
      // Kompakt tutulur (~85 token): harita sysMsg'e GOMULMEZ, gerektiginde okunur
      let selfInfo = '';
      try {
        const skillCount = require('../utils/skill-index')._discoverSkills().length;
        const pkgRoot = path.join(__dirname, '..', '..');
        selfInfo = '\nKurulumun: kok=' + pkgRoot
          + ' | skill sayin TAM OLARAK ' + skillCount + ' (kok/skills = ~/.natureco/skills-builtin; ~/.natureco/skills YALNIZ kullanici skill\'leri)'
          + ' | arac sayin TAM OLARAK ' + tools.length + ' (kok/src/tools).'
          + ' Oz-bilgi/onarim haritan: kok/SELF.md — "kendini incele/onar/nasil calisiyorsun" istenirse ONCE onu read_file ile oku;'
          + ' onarim: read_file→edit_file→node --check, sonucu durustce raporla.';
      } catch { /* sayilamazsa satiri atla */ }

      const sysMsg = [
        'Sen NatureCo adli, arac kullanabilen bir yapay zeka ajanisin. Kullanicinin istegini SADECE anlatarak degil, ARACLARI cagirarak fiilen gerceklestir.',
        memCtx ? '\nKullanici bilgisi:\n' + memCtx : '',
        '\n\nOrtam:\n- Isletim sistemi: ' + process.platform + '\n- Kullanici home: ' + os.homedir() + '\n- Masaustu: ' + desktop + '\n- Calisma dizini: ' + process.cwd() + selfInfo,
        '\n\nArac cagirmak icin TAM olarak su formati kullan:\n<minimax:tool_call>\n<invoke name="ARAC_ADI">\n<parameter name="PARAM">DEGER</parameter>\n</invoke>\n</minimax:tool_call>',
        '\n\nKullanabilecegin araclar (p: = parametreler):',
        '- write_file: dosya olustur/uzerine yaz. p: path (TAM yol), content (dosyanin TAM icerigi, kisaltma yok).',
        '- read_file: oku (p: path) | list_dir: dizini listele (p: path) | file_search: glob ile dosya bul (p: pattern orn "**/*.js").',
        '- edit_file: MEVCUT dosyada metin degistir. p: path, old_string (birebir mevcut), new_string. Kismi degisiklikte write_file yerine bunu kullan.',
        '- grep_search: dosya ICERIGINDE desen ara (bash grep yerine bunu tercih et). p: pattern, path, includePattern?, maxResults?.',
        '- bash: kabuk komutu (npm/git/node/python/test/mkdir...). p: command. Yikici/tehlikeli komutlar politikayla engellenir.',
        '- skill_find: skill ara (p: query) → skill_view: skill yukle (p: name).',
        '- cron_create: zamanlanmis gorev. p: name, schedule ("0 9 * * *" veya "every day 9am"), command, description.',
        '- duckduckgo_search: internet aramasi, API key GEREKMEZ, her zaman calisir. p: query, maxResults | web_search: Tavily key ayarliysa; degilse duckduckgo kullan.',
        '- todo_write: aktif gorev listesi. p: action (list/add/update/start/done/remove/clear) + alanlar.',
        '- git: git islemi (p: operation/args/message) | http_request: HTTP istegi (p: url, method, headers, body) | code_execution: sandbox kod (p: code, language).',
        '- sub_agent: alt-gorevi bagimsiz alt-agent\'a devret (p: task, context?, maxTokens?). Paralel/odakli isler; coklu cagriyla orchestrate edebilirsin.',
        '- plan: cok-adimli gorevde SADECE plan metni uret, islem yapmaz (p: action create/list, task, depth). "once planla / yol haritasi" istenirse.',
        '- notebook_edit: .ipynb hucre duzenle (p: filePath...) | clarify: netlestirme sorusu sor (p: question, options).',
        '- calendar_add / reminder_add / notes_add / mac_notify: macOS asistan islevleri (macOS degilse arac soyler).',
        '- image_generation (p: prompt, size) | text_to_speech (p: text) | speech_to_text (p: audioPath).',
        '- memory_write: HIZLI tek bilgi kaydet (p: username="' + memUser + '", fact, category) | memory_tree: AGAC-HAFIZA, zengin kalici bilgi (p: action index|read|search|append|remove, username="' + memUser + '", append icin root 1-kisisel|2-teknik|3-kararlar + branch + content). Ikisi de YENI oturumda hatirlanir.',
        '\nKurallar:',
        '- Kalici bilgi paylasilirsa ya da "hatirla/not al/kaydet" denirse HEMEN kaydet (username="' + memUser + '"): kisa → memory_write; zengin → memory_tree(append, dogru root/branch). Trivial/gecici seyleri kaydetme.',
        '- KAYIT KALITESI: fact\'i soylenen ANLAM ve SPESIFIK DEGERLERLE yaz — kod/isim/sayi/tarih AYNEN ("kod adi ONYX-7"yi "onyx" yapma); etiketi dogru koy (proje kodu ≠ kullanici adi). Yanlis ozet = yeni oturumda yanlis hatirlama.',
        '- Kisiye ozel soru (gecmis/proje/tercih) → ONCE memory_tree(search/read) ile ilgili dali oku. Bilgi tek yerde yasar; credential ASLA duz metin.',
        '- Yarim kalan is / "sonra yapalim" → memory_tree(append, root:"3-kararlar", branch:"Bekleyen İşler") — yeni oturumda otomatik hatirlatilir; tamamlaninca memory_tree(remove) ile kaldir.',
        '- Guncel/internet bilgisi → ONCE duckduckgo_search ("internet erisimim yok" DEME).',
        '- Gorev listesi/todo → todo_write (memory_tree DEGIL).',
        '- Zamanlanmis/tekrarlayan is → SADECE cron_create (bash ile crontab/schtasks DUZENLEME — "natureco cron list"te gorunmez). Sonrasinda kullaniciya MUTLAKA soyle: fiilen calismasi icin "natureco daemon start" (veya install) gerekir; bunu soylemeden kesin basari iddia etme.',
        '- Dosya degistirmeden ONCE read_file ile oku, edit_file ile hedefli degistir. Yerini bilmiyorsan file_search/grep_search ile kesfet.',
        '- Kod yazinca/degistirince bash ile calistir/test et, hata varsa duzelt. Coklu dosya = her biri icin AYRI write_file. Hep TAM yol; "masaustu" = ' + desktop + '.',
        '- Arac sonuclari <tool_results> icinde doner; is bitince arac cagirmadan tek cumlelik ozet yaz. Basit sohbette arac cagirma, dogrudan yanitla.',
        execFull ? '- Tarayici gorevinde kullanicinin secimini izle: "Chromium/browser agent" → browser ile open→snapshot→ref action→snapshot; "acik kendi Chrome pencerem" → SADECE computer_use_loop. Bir yol hata verince ayni turda kor fallback zinciri kurma. Mesaj/gonderim/satin alma sonucunu son snapshot veya GUI kaniti olmadan tamamlandi deme.' : '',
        fullToolsBlock,
        treeDigest ? ('\n\nBILDIGIN KALICI HAFIZA (bu kullaniciya ait, onceki oturumlardan hatirladiklarin; kullaniciya ozel bir sey sorulursa ONCE BUNU KULLAN — dosya arama, uydurma):\n' + treeDigest) : '',
        treeIndex ? ('\n\nHafiza agaci yapisi (yukarida olmayan detay icin memory_tree(action:read/search) ile ilgili kok/dali oku):\n' + treeIndex) : '',
        skillsIndexBlock ? '\n\n' + skillsIndexBlock : '',
      ].filter(Boolean).join('\n');

      const historyMessages = [];
      if (conversationHistory && Array.isArray(conversationHistory)) {
        for (const hm of conversationHistory) { if (hm._internal) continue; historyMessages.push({ role: hm.role, content: hm.content || '' }); }
      }

      // Streaming: yalnizca TTY'de ve caller (repl) stream:true gecince. SSE token'lari
      // XML-gizleyen filtre + model-adi sanitizer zincirinden gecip stdout'a canli akar.
      const streamOn = params.stream === true && !!(process.stdout && process.stdout.isTTY);
      const botName = cfg.botName || 'Asistan';
      const { makeStreamFilter, makeSanitizeStream } = require('./agentic-runner');

      async function callModel(msgs) {
        if (streamOn) {
          let cleared = false;
          const clearThinking = () => { if (!cleared) { process.stdout.write('\r\x1b[K'); cleared = true; } };
          process.stdout.write('\x1b[2m  💭 düşünüyor…\x1b[0m');
          const sani = makeSanitizeStream(botName, t => { clearThinking(); process.stdout.write(t); });
          const filter = makeStreamFilter(t => sani.push(t), null);
          const body = { model, stream: true, messages: msgs, temperature: 0.3, max_tokens: 16000 };
          const out = await apiCallStream(providerUrl, providerApiKey, body, d => filter.push(d));
          filter.end(); sani.end(); clearThinking();
          return { content: out.content || '', toolCalls: out.toolCalls || [] };
        }
        const body = { model, stream: false, messages: msgs, temperature: 0.3, max_tokens: 16000 };
        const r = await apiCall(providerUrl, providerApiKey, body);
        const msg = r.choices?.[0]?.message || {};
        return { content: msg.content || '', toolCalls: msg.tool_calls || [] };
      }

      // Araç aktivitesi gösterimi (TTY streaming): her araç icin "🔧 label · hint ✓/✗"
      const TOOL_LABEL = { write_file: 'dosya yaz', read_file: 'oku', edit_file: 'düzenle', bash: 'komut', file_search: 'ara', list_dir: 'listele', skill_view: 'skill', browser: 'tarayıcı', browser_use: 'tarayıcı', mac_app_open: 'uygulama aç', mac_app_quit: 'uygulama kapat', computer_use: 'GUI', computer_use_loop: 'GUI görsel döngü', social_open: 'medya aç', macos_screenshot: 'ekran görüntüsü' };
      function briefHint(args) {
        if (!args || typeof args !== 'object') return '';
        const v = args.appName || args.query || args.name || args.url || args.command || args.pattern || args.path || args.action;
        return v ? String(v).replace(/\s+/g, ' ').slice(0, 46) : '';
      }
      const onEvent = streamOn ? (ev) => {
        if (ev.phase === 'start') {
          const label = TOOL_LABEL[ev.tool] || ev.tool;
          const hint = briefHint(ev.args);
          process.stdout.write('\n\x1b[2m  🔧 ' + label + (hint ? ' · ' + hint : '') + '\x1b[0m');
        } else {
          const rec = (ev.records || [])[0] || {};
          // Satırı burada bitir. Sonraki model çağrısının thinking göstergesi
          // mevcut satırı \r + erase-line ile temizlediği için newline yoksa
          // kullanıcı araç adını ve sonucunu hiç göremiyordu.
          const error = rec.status === 'done' ? '' : String(rec.error || rec.result?.error || '').replace(/\s+/g, ' ').slice(0, 100);
          process.stdout.write((rec.status === 'done' ? ' \x1b[32m✓\x1b[0m' : ' \x1b[31m✗\x1b[0m') + (error ? ' \x1b[31m' + error + '\x1b[0m' : '') + '\n');
        }
      } : null;

      try {
        const { records, reply } = await runAgentic({
          callModel, systemPrompt: sysMsg, historyMessages, task,
          toolsDir: __dirname, execFull, onEvent, maxIterations: 15,
        });
        const fileWrites = records.filter(r => r.tool === 'write_file' && r.status === 'done');
        let finalReply = reply || '';
        if (fileWrites.length > 0) {
          const lines = fileWrites.map(r => `  ✓ ${path.basename((r.result && r.result.path) || (r.args && r.args.path) || '')} olusturuldu (${(r.result && r.result.size != null) ? r.result.size : '?'} bytes)`).join('\n');
          const fileSummary = 'Dosya(lar):\n' + lines;
          finalReply = (finalReply ? finalReply + '\n\n' : '') + fileSummary;
          if (streamOn) process.stdout.write('\n\n' + fileSummary + '\n');
        }
        const done = records.filter(r => r.status === 'done').length;
        return {
          success: true,
          workflowId: (records.length ? 'agentic_' : 'passthrough_') + Date.now().toString(36),
          name: records.length ? 'Agentic Run' : 'Direct Chat',
          status: 'completed',
          totalSteps: records.length,
          completedSteps: done,
          results: records.map((r, i) => ({ step: i + 1, ...r })),
          passthrough: true,
          streamed: streamOn,
          reply: finalReply || 'Tamamlandi.',
        };
      } catch (e) {
        return { success: false, error: 'Yanit alinamadi: ' + e.message };
      }
    }

    // Phase 0: Check if simple chat (passthrough) — no planning needed
    const simpleCheckPrompt = {
      role: 'system',
      content: 'Gorevin basit bir selamlasma/sohbet mi yoksa arac gerektiren bir islem mi oldugunu belirle. Sadece "simple" veya "complex" yaz, kesinlikle baska bir sey yazma. Noktalama isareti koyma.\n\nSimple: selamlasma, nasilsin, bugun ne yaptin, havadan sudan, genel bilgi sorusu, ben kimim, adim ne, kullanici bilgisi sorgulama, hatirlatma talebi\nComplex: dosya islemleri, kod yazma, arastirma, karsilastirma, duzenleme, otomasyon, proje yonetimi, debug, internette arama gerektiren isler'
    };
    const simpleBody = { model, stream: false, messages: [simpleCheckPrompt, { role: 'user', content: task }], temperature: 0, max_tokens: 20 };
    let isSimple = false;
    try {
      const simpleResult = await apiCall(providerUrl, providerApiKey, simpleBody);
      const raw = (simpleResult.choices?.[0]?.message?.content || '').trim().toLowerCase().replace(/[^a-z]/g, '');
      isSimple = raw === 'simple';
    } catch {}

    if (isSimple) {
      // Passthrough: just chat with LLM, no tools — include user memory + conversation history
      const memCtx = memoryContext();
      const sysMsg = 'Sen yardimci bir asistansin. Kisa ve oz yanit ver. Konusma gecmisi varsa onceki mesajlari dikkate al.' + (memCtx ? '\n\nKullanici bilgisi:\n' + memCtx : '') + '\n\n' + skillsIndexBlock;
      const chatBody = { model, stream: false, messages: chatMessages(sysMsg, task), temperature: 0.7, max_tokens: 1000 };
      try {
        const chatResult = await apiCall(providerUrl, providerApiKey, chatBody);
        const reply = chatResult.choices?.[0]?.message?.content || '';
        return { success: true, workflowId: 'passthrough', name: 'Direct Chat', status: 'completed', totalSteps: 0, completedSteps: 0, results: [{ step: 0, tool: 'chat', status: 'done', result: { reply } }], passthrough: true, reply };
      } catch (e) {
        return { success: false, error: 'Sohbet yaniti alinamadi: ' + e.message };
      }
    }

    // Phase 1: LLM plans the workflow
    const memCtx = memoryContext();
      const planPrompt = {
        role: 'system',
        content: 'Sen bir workflow planlama asistanisin. Verilen gorev icin hangi tool\'larin kullanilacagini ve hangi sirayla calisacagini belirle. SADECE JSON formatinda yanit ver, baska bir sey yazma.\n\nKullanilabilir tool\'lar:\n' +
          tools.map(t => '- ' + t).join('\n') +
          '\n\nKullanilabilir skill\'ler (gorevle ilgili skill varsa plana skill_view adimi olarak ekle):\n' + skillsIndexBlock +
          (memCtx ? '\n\nKullanici bilgisi:\n' + memCtx : '') +
          '\n\nJSON format:\n{\n  "workflowName": "...",\n  "description": "...",\n  "skillsLoaded": ["..."],\n  "steps": [\n    { "step": 1, "tool": "tool_name", "purpose": "...", "params": { ... } }\n  ]\n}\n\nHer adim icin params kismina tool\'un gerektirdigi parametreleri ekle. Adimlar birbirine bagimli olabilir, onceki adimin outputu sonraki adimin inputu olarak kullanilabilir.\n\nGorevle ilgili skill varsa ILK adim olarak skill_view ile yukle, ardindan diger adimlara gec.'
    };
    const planBody = {
      model, stream: false,
      messages: [planPrompt, { role: 'user', content: 'Gorev: ' + task }],
      temperature: 0.3, max_tokens: 4000,
    };

    let planResult;
    try {
      planResult = await apiCall(providerUrl, providerApiKey, planBody);
    } catch (e) {
      return { success: false, error: 'Plan olusturulamadi: ' + e.message, phase: 'planning' };
    }

    // v5.14.2: Brace-balanced JSON extraction (handles explanatory text around JSON)
    function extractJSON(str) {
      const start = str.indexOf('{');
      if (start === -1) return null;
      let depth = 0, inString = false, escape = false;
      for (let i = start; i < str.length; i++) {
        const ch = str[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) return str.slice(start, i + 1); }
        }
      }
      return null;
    }
    let plan;
    try {
      const content = planResult.choices?.[0]?.message?.content || '';
      const jsonStr = extractJSON(content);
      if (!jsonStr) throw new Error('JSON bloku bulunamadi');
      plan = JSON.parse(jsonStr);
      if (!plan.steps || !Array.isArray(plan.steps)) throw new Error('Steps bulunamadi');
    } catch (e) {
      // JSON parse hatasi — modelin ham ciktisini passthrough chat olarak goster
      const rawReply = planResult.choices?.[0]?.message?.content || '';
      if (rawReply) {
        return { success: true, workflowId: 'passthrough', name: 'Direct Chat', status: 'completed', totalSteps: 0, completedSteps: 0, results: [{ step: 0, tool: 'chat', status: 'done', result: { reply: rawReply } }], passthrough: true, reply: rawReply };
      }
      return { success: false, error: 'Plan cozumlenemedi: ' + e.message, raw: rawReply.slice(0, 500) };
    }

    // Save plan
    const wfId = workflowId || 'wf_' + Date.now().toString(36);
    const wfFile = path.join(WORKFLOW_DIR, wfId + '.json');
    const wfEntry = { id: wfId, task, name: plan.workflowName || task.slice(0, 50), description: plan.description || '', steps: plan.steps, status: 'running', startedAt: new Date().toISOString(), results: [] };
    fs.writeFileSync(wfFile, JSON.stringify(wfEntry, null, 2));

    // Phase 2: Execute steps sequentially
    const stepResults = [];
    let failed = false;

    for (const step of plan.steps) {
      if (failed) {
        stepResults.push({ step: step.step, tool: step.tool, status: 'skipped', reason: 'Onceki adim basarisiz' });
        continue;
      }

      // Check if tool is valid
      if (!tools.includes(step.tool)) {
        stepResults.push({ step: step.step, tool: step.tool, status: 'error', error: 'Bilinmeyen tool: ' + step.tool + '. Kullanilabilir: ' + tools.slice(0, 10).join(', ') + '...' });
        failed = true;
        continue;
      }

      // Build the execute prompt — we use LLM to call the tool with correct params
      const executePrompt = {
        role: 'system',
        content: 'Bir sonraki adimi calistiriyorsun. Sana verilen tool\'u ve parametreleri kullanarak islemi gerceklestir. Tool cagrisini dogru formatta yap.\n\nTool: ' + step.tool + '\nAmac: ' + (step.purpose || '') + '\nPlanlanan parametreler: ' + JSON.stringify(step.params || {}) +
          '\n\nOnceki adim sonuclari:\n' + stepResults.map(r => 'Adim ' + r.step + ' (' + r.tool + '): ' + (r.status === 'done' ? JSON.stringify(r.result).slice(0, 300) : r.status)).join('\n') +
          '\n\nKullanilabilir skill\'ler:\n' + skillsIndexBlock +
          '\n\nTek bir tool cagrisi yap ve sonucu bekle. Tool cagrisi yaparken Onceki adim sonuclarindaki gerekli verileri parametre olarak kullan. Ilgili skill varsa once skill_view ile yukle, sonra asil tool\'u cagir.'
      };
      const executeBody = {
        model, stream: false,
        messages: [executePrompt, { role: 'user', content: 'Adim ' + step.step + ': ' + step.tool + ' ile ' + (step.purpose || 'islem') + ' yap.' }],
        temperature: 0.2, max_tokens: 2000,
        tools: [{ type: 'function', function: { name: step.tool, description: step.purpose || '', parameters: {} } }],
        tool_choice: { type: 'function', function: { name: step.tool } },
      };

      let execResult;
      try {
        execResult = await apiCall(providerUrl, providerApiKey, executeBody);
        const msg = execResult.choices?.[0]?.message || {};
        const tc = msg.tool_calls?.[0];

        if (tc && tc.function) {
          const args = JSON.parse(tc.function.arguments || '{}');
          const toolMod = require(path.join(__dirname, '..', 'tools', step.tool + '.js'));
          const fn = toolMod.execute || (toolMod.default && toolMod.default.execute);
          if (!fn) { throw new Error(step.tool + ' toolunda execute fonksiyonu bulunamadi'); }
          const toolResult = await executeThroughGateway({
            toolName: step.tool,
            args,
            resolveTool: () => toolMod,
            execute: fn,
            normalizeSuccess: value => value,
            normalizeError: error => ({ success: false, error }),
          });
          stepResults.push({ step: step.step, tool: step.tool, status: 'done', args, result: toolResult });
        } else if (msg.content) {
          stepResults.push({ step: step.step, tool: step.tool, status: 'done', note: 'Tool cagrilmadi, model dogrudan yanit verdi', content: msg.content.slice(0, 500) });
        } else {
          stepResults.push({ step: step.step, tool: step.tool, status: 'error', error: 'Tool cagrisi yapilmadi' });
          failed = true;
        }
      } catch (e) {
        stepResults.push({ step: step.step, tool: step.tool, status: 'error', error: e.message });
        failed = true;
      }
    }

    // Update workflow file
    wfEntry.status = failed ? 'completed_with_errors' : 'completed';
    wfEntry.completedAt = new Date().toISOString();
    wfEntry.results = stepResults;
    fs.writeFileSync(wfFile, JSON.stringify(wfEntry, null, 2));

    // Save to history
    ensureDir(path.dirname(WORKFLOW_HISTORY));
    let history = [];
    try { history = JSON.parse(fs.readFileSync(WORKFLOW_HISTORY, 'utf8')); } catch {}
    history.unshift({ id: wfId, name: plan.workflowName || task.slice(0, 50), task, status: wfEntry.status, steps: plan.steps.length, completedAt: wfEntry.completedAt });
    fs.writeFileSync(WORKFLOW_HISTORY, JSON.stringify(history.slice(0, 50), null, 2));

    const skillsLoaded = stepResults
      .filter(r => r.tool === 'skill_view' && r.status === 'done')
      .map(r => r.args?.name || 'bilinmeyen-skill');

    return {
      success: true,
      workflowId: wfId,
      name: plan.workflowName || '',
      description: plan.description || '',
      totalSteps: plan.steps.length,
      completedSteps: stepResults.filter(r => r.status === 'done').length,
      failedSteps: stepResults.filter(r => r.status === 'error' || r.status === 'skipped').length,
      status: wfEntry.status,
      skillsLoaded: skillsLoaded.length > 0 ? skillsLoaded : undefined,
      plan: plan.steps.map(s => ({ step: s.step, tool: s.tool, purpose: s.purpose })),
      results: stepResults.map(r => ({
        step: r.step, tool: r.tool, status: r.status,
        result: r.status === 'done' ? r.result : undefined,
        error: r.error, note: r.note,
      })),
      workflowFile: wfFile,
    };
  }

  // ── PLAN_ONLY: Just generate the plan without executing ──────────────
  if (action === 'plan') {
    if (!task) return { success: false, error: 'task gerekli' };
    const planPrompt = {
      role: 'system',
      content: 'Kullanilabilir tool\'lar:\n' + tools.map(t => '- ' + t).join('\n') +
        '\n\nKullanilabilir skill\'ler:\n' + skillsIndexBlock +
        '\n\nGorev icin bir workflow plani JSON formatinda olustur. JSON disinda hicbir sey yazma.\nFormat: { "workflowName": "...", "description": "...", "estimatedSteps": N, "skillsLoaded": ["..."], "steps": [{ "step": 1, "tool": "...", "purpose": "...", "params": {...}, "expectedOutput": "..." }] }\n\nGorevle ilgili skill varsa plana skill_view adimi olarak ekle.'
    };
    const planBody = {
      model, stream: false,
      messages: [planPrompt, { role: 'user', content: 'Gorev: ' + task }],
      temperature: 0.3, max_tokens: 4000,
    };
    try {
      const result = await apiCall(providerUrl, providerApiKey, planBody);
      const content = result.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const plan = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      return { success: true, plan, raw: content.slice(0, 1000) };
    } catch (e) {
      return { success: false, error: 'Plan olusturulamadi: ' + e.message };
    }
  }

  // ── SAVE / LOAD / LIST / DELETE ───────────────────────────────────────
  if (action === 'save') {
    if (!name || !steps) return { success: false, error: 'name ve steps gerekli' };
    const wfId = 'wf_' + name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const wf = { id: wfId, name, description: params.description || '', steps, status: 'saved', createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(WORKFLOW_DIR, wfId + '.json'), JSON.stringify(wf, null, 2));
    return { success: true, workflowId: wfId, message: name + ' kaydedildi' };
  }

  if (action === 'load') {
    const wfId = workflowId || name;
    if (!wfId) return { success: false, error: 'workflowId gerekli' };
    const wfFile = path.join(WORKFLOW_DIR, wfId + '.json');
    if (!fs.existsSync(wfFile)) {
      // Try to find by name
      const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'));
          if (data.name === wfId || data.id === wfId) {
            return { success: true, workflow: data };
          }
        } catch {}
      }
      return { success: false, error: 'Workflow bulunamadi: ' + wfId };
    }
    const data = JSON.parse(fs.readFileSync(wfFile, 'utf8'));
    return { success: true, workflow: data };
  }

  if (action === 'list') {
    const files = fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'));
        return { id: data.id, name: data.name, status: data.status, steps: data.steps?.length || 0, createdAt: data.createdAt || data.startedAt };
      } catch { return null; }
    }).filter(Boolean);
    return { success: true, workflows: list };
  }

  if (action === 'delete') {
    const wfId = workflowId || name;
    if (!wfId) return { success: false, error: 'workflowId gerekli' };
    const wfFile = path.join(WORKFLOW_DIR, wfId + '.json');
    if (!fs.existsSync(wfFile)) {
      return { success: false, deleted: false, error: 'Workflow bulunamadi: ' + wfId };
    }
    fs.unlinkSync(wfFile);
    return { success: true, deleted: true, message: wfId + ' silindi' };
  }

  // ── RETRY: Regenerate and rerun a specific step ──────────────────────
  if (action === 'retry') {
    const wfId = workflowId;
    if (!wfId) return { success: false, error: 'workflowId gerekli' };
    if (typeof regenerateStep !== 'number') return { success: false, error: 'regenerateStep (step numarasi) gerekli' };
    const wfFile = path.join(WORKFLOW_DIR, wfId + '.json');
    if (!fs.existsSync(wfFile)) return { success: false, error: 'Workflow bulunamadi: ' + wfId };
    const wf = JSON.parse(fs.readFileSync(wfFile, 'utf8'));
    const step = wf.steps?.find(s => s.step === regenerateStep);
    if (!step) return { success: false, error: 'Adim bulunamadi: ' + regenerateStep };
    step.params = params.newParams || step.params;
    fs.writeFileSync(wfFile, JSON.stringify(wf, null, 2));
    return { success: true, message: 'Adim ' + regenerateStep + ' yeniden calistirilmak uzere isaretlendi. Tekrar run yapin.', step };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (run, plan, save, load, list, delete, retry)' };
}

module.exports = {
  name: 'workflow',
  description: '[ORCHESTRATOR] SADECE cok adimli EYLEM gorevleri icin (dosya islemleri, komutlar, arastirma zinciri). Soru-cevap, sohbet, bilgi/aciklama isteklerinde KULLANMA — onlara dogrudan metinle yanit ver. Plan/run/save/load/list/delete/retry.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'run (tam otomatik), plan (sadece plan), save, load, list, delete, retry', enum: ['run', 'plan', 'save', 'load', 'list', 'delete', 'retry'] },
      task: { type: 'string', description: '(run/plan) Yapilacak gorev — dogal dil ile anlat' },
      steps: { type: 'array', description: '(save) Kaydedilecek adimlar', items: { type: 'object' } },
      name: { type: 'string', description: '(save/load) Workflow adi' },
      workflowId: { type: 'string', description: '(load/delete/retry) Workflow ID' },
      regenerateStep: { type: 'number', description: '(retry) Yeniden calistirilacak adim numarasi' },
      newParams: { type: 'object', description: '(retry) Yeni parametreler' },
      description: { type: 'string', description: 'Aciklama' },
      conversationHistory: { type: 'array', description: '(internal) REPL konusma gecmisi', items: { type: 'object' } },
    },
    required: ['action'],
  },
  async execute(params) { return await workflow(params); },
  _internal: { allToolNames },
};
