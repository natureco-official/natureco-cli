const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKFLOW_DIR = path.join(os.homedir(), '.natureco', 'workflows');
const WORKFLOW_HISTORY = path.join(os.homedir(), '.natureco', 'workflow-history.json');

const { buildSkillIndex } = require('../utils/skill-index');

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
}
function isMiniMax(url) { return url && (url.includes('minimax.io') || url.includes('minimaxi.com') || url.includes('minimax.cn')); }
function isGemini(url) { return url && (url.includes('generativelanguage.googleapis.com') || url.includes('gemini')); }

function allToolNames() {
  try {
    const toolsDir = path.join(__dirname, '..', 'tools');
    return fs.readdirSync(toolsDir).filter(f => f.endsWith('.js')).map(f => path.basename(f, '.js'));
  } catch { return []; }
}

function loadUserMemory(username) {
  try {
    const dir = path.join(os.homedir(), '.natureco', 'memory');
    const uname = (username || 'default').toLowerCase();
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
          const dn = (dm.name || '').toLowerCase();
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
        const key = v.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        facts.push(v.trim());
      }
    }
    // isim memory.name'de yoksa fact'lerden cikar
    if (!name) {
      for (const f of facts) {
        const match = f.toLowerCase().match(/(?:kullanici\s*adi?|kullanıcı\s*adı?|isim|name)\s*:?\s*(.+)/);
        if (match && match[1].trim().length > 2) { name = match[1].trim(); break; }
      }
    }
    const parts = [];
    if (name) parts.push(`Kullanici adi: ${name}`);
    if (botName) parts.push(`Bot adi: ${botName}`);
    if (facts.length > 0) parts.push(`Bilinenler: ${facts.slice(0, 15).join('; ')}`);
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
    const req = https.request(endpoint, {
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
    const req = https.request(endpoint, {
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

  if (!providerUrl || !providerApiKey) {
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
  function supportsToolCalls() {
    const url = (providerUrl || '').toLowerCase();
    // MiniMax, Gemini (direct), Ollama, Mistral (direct) tool calling'i desteklemez
    if (url.includes('minimax')) return false;
    if (url.includes('ollama')) return false;
    if (url.includes('localhost')) return false;
    if (url.includes('groq')) return false;
    return true; // OpenAI, Anthropic, vs.
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
      const sysMsg = [
        'Sen NatureCo adli, arac kullanabilen bir yapay zeka ajanisin. Kullanicinin istegini SADECE anlatarak degil, ARACLARI cagirarak fiilen gerceklestir.',
        memCtx ? '\nKullanici bilgisi:\n' + memCtx : '',
        '\n\nOrtam:\n- Isletim sistemi: ' + process.platform + '\n- Kullanici home: ' + os.homedir() + '\n- Masaustu: ' + desktop + '\n- Calisma dizini: ' + process.cwd(),
        '\n\nArac cagirmak icin TAM olarak su formati kullan:\n<minimax:tool_call>\n<invoke name="ARAC_ADI">\n<parameter name="PARAM">DEGER</parameter>\n</invoke>\n</minimax:tool_call>',
        '\n\nKullanabilecegin araclar:',
        '- write_file: dosya olustur/uzerine yaz. parametreler: path (TAM yol), content (dosyanin TAM icerigi). Kod/oyun/site isteniyorsa TUM icerigi content icine yaz, kisaltma.',
        '- read_file: dosya oku. parametre: path',
        '- edit_file: MEVCUT dosyada metin degistir. parametreler: path, old_string (birebir mevcut metin), new_string. Bir dosyanin bir kismini degistirirken write_file yerine bunu kullan (tum dosyayi yeniden yazma).',
        '- file_search: glob ile dosya bul. parametre: pattern (orn. "**/*.js", "src/**/*.json").',
        '- list_dir: dizin icerigini listele. parametre: path',
        '- bash: kabuk komutu calistir (npm, git, node, python, test, ls, grep/findstr, mkdir...). parametre: command. Guvenli komutlar dogrudan calisir; yikici/tehlikeli komutlar guvenlik politikasiyla engellenir. Icerik aramasi icin grep/findstr kullan.',
        '- skill_view: gorevle ilgili bir skill yukle. parametre: name',
        '\nKurallar:',
        '- MEVCUT bir dosyayi degistirmeden ONCE read_file ile oku; sonra edit_file ile hedefli degisiklik yap (tum dosyayi write_file ile ezme).',
        '- Bir seyi nerede oldugunu bilmiyorsan once file_search/list_dir/bash(grep) ile kesfet.',
        '- Kod yazdiktan/degistirdikten sonra gerektiginde bash ile calistir/test et (orn. "node dosya.js", "npm test"); hata cikarsa duzelt.',
        '- Birden fazla dosya gerekiyorsa her biri icin AYRI write_file cagir.',
        '- Kullanici "masaustu"/"desktop" dediyse ve tam yol vermediyse dosyayi buraya yaz: ' + desktop,
        '- Goreceli yol yerine TAM yol kullan.',
        '- Arac sonuclari <tool_results> icinde geri gelir; gorev bitince ARAC CAGIRMADAN tek cumlelik ozet yaz.',
        '- Basit sohbet/selamlasma ise arac cagirma, dogrudan kisa yanit ver.',
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
          const sani = makeSanitizeStream(botName, t => process.stdout.write(t));
          const filter = makeStreamFilter(t => sani.push(t), null);
          const body = { model, stream: true, messages: msgs, temperature: 0.3, max_tokens: 16000 };
          const out = await apiCallStream(providerUrl, providerApiKey, body, d => filter.push(d));
          filter.end(); sani.end();
          return { content: out.content || '', toolCalls: out.toolCalls || [] };
        }
        const body = { model, stream: false, messages: msgs, temperature: 0.3, max_tokens: 16000 };
        const r = await apiCall(providerUrl, providerApiKey, body);
        const msg = r.choices?.[0]?.message || {};
        return { content: msg.content || '', toolCalls: msg.tool_calls || [] };
      }

      try {
        const { records, reply } = await runAgentic({
          callModel, systemPrompt: sysMsg, historyMessages, task,
          toolsDir: __dirname, maxIterations: 15,
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
          const toolResult = await fn(args);
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
    if (fs.existsSync(wfFile)) fs.unlinkSync(wfFile);
    return { success: true, message: wfId + ' silindi' };
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
};
