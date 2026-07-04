/**
 * agentic-runner — "agentic-text" modeller (MiniMax M2.x gibi) icin bounded tool döngüsü.
 *
 * Neden: MiniMax M2.5 tool call'larini OpenAI tarzi `message.tool_calls` JSON'u yerine
 * dogrudan metin icinde native XML olarak uretir:
 *   <minimax:tool_call><invoke name="write_file"><parameter name="path">...</parameter>
 *   <parameter name="content">...</parameter></invoke></minimax:tool_call>
 * Ayrica skill'leri <skill>ad</skill> ile yuklemek ister. Eski passthrough bunlari
 * hic islemedigi icin (JSON.parse patliyor, bos catch yutuyor) dosya asla yazilmiyordu.
 *
 * Bu modul o XML'i parse eder, gercek araclari (write_file/read_file/edit_file/skill_view)
 * calistirir, sonuclari modele geri besler ve is bitene kadar (ya da MAX adima kadar) doner.
 *
 * Guvenlik: sadece allowlist'teki araclar calisir. bash/shell gibi keyfi komut calistirma
 * bu modda KAPALIDIR (onay katmanini atlamamak icin).
 */
const path = require('path');
const os = require('os');

// Agentic dongude izin verilen araclar. bash BURADA ama guvenli: bash.js kendi
// icinde approvals politikasini uyguluyor (isSafeCommand → direkt; tehlikeli → red;
// digerleri → allowlist/full moda gore). Yani keyfi/yikici komut calismaz.
// Diger ~85 arac (discord, telegram, cron, browser...) bilerek DISARIDA.
const DEFAULT_ALLOWED = ['write_file', 'read_file', 'edit_file', 'skill_view', 'bash'];

const TOOL_ALIASES = {
  write_file: 'write_file', create_file: 'write_file', writefile: 'write_file', write: 'write_file', create: 'write_file', save_file: 'write_file', new_file: 'write_file',
  read_file: 'read_file', readfile: 'read_file', view_file: 'read_file', open_file: 'read_file', cat: 'read_file',
  edit_file: 'edit_file', editfile: 'edit_file', str_replace: 'edit_file', str_replace_editor: 'edit_file', replace_in_file: 'edit_file',
  skill_view: 'skill_view', skillview: 'skill_view', load_skill: 'skill_view', view_skill: 'skill_view', skill: 'skill_view',
  bash: 'bash', run_command: 'bash', shell: 'bash', shell_command: 'bash', exec: 'bash', run_terminal: 'bash', terminal: 'bash', run: 'bash', command: 'bash',
};

function expandHome(p) {
  if (!p || typeof p !== 'string') return p;
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

// Ajanin urettigi komutlar icin ekstra koruma. bash.js kendi politikasini uygular
// ama varsayilan 'full' mod yikici komutlari (rm -rf gibi) bile gecirir — bu insan
// icin bilincli olabilir, ama MODELIN urettigi komut icin degil. Bu yuzden agentic
// yolda yikici komutlari politikadan BAGIMSIZ olarak engelliyoruz.
function defaultIsDangerous(cmd) {
  try { return require('../utils/approvals').isDangerousCommand(cmd); } catch { return false; }
}

/**
 * Model metninden agentic tool cagrilarini cikar.
 * Destekler: <invoke name><parameter name> (opsiyonel <minimax:tool_call> sarmali),
 * <skill>ad</skill> kisayolu, ve yan yana gelen native OpenAI tool_calls.
 */
function parseAgenticCalls(content, nativeToolCalls) {
  const calls = [];
  content = content || '';

  for (const tc of nativeToolCalls || []) {
    const fn = tc.function || {};
    if (!fn.name) continue;
    let args = {};
    try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : (fn.arguments || {}); } catch {}
    calls.push({ tool: fn.name, args });
  }

  const invokeRe = /<invoke\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/invoke>/g;
  let m;
  while ((m = invokeRe.exec(content)) !== null) {
    const tool = m[1].trim();
    const body = m[2];
    const args = {};
    const paramRe = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/g;
    let pm;
    while ((pm = paramRe.exec(body)) !== null) {
      args[pm[1].trim()] = pm[2];
    }
    calls.push({ tool, args });
  }

  const skillRe = /<skill>\s*([^<>\n]+?)\s*<\/skill>/g;
  while ((m = skillRe.exec(content)) !== null) {
    const name = m[1].trim();
    if (!calls.some(c => /skill/i.test(c.tool || '') && c.args && c.args.name === name)) {
      calls.push({ tool: 'skill_view', args: { name } });
    }
  }

  return calls;
}

/** Final yanittan protokol jetonlarini temizle (kullaniciya gosterim icin). */
function stripProtocolTokens(s) {
  return (s || '')
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '')
    .replace(/<invoke[\s\S]*?<\/invoke>/g, '')
    .replace(/<skill>[\s\S]*?<\/skill>/g, '')
    .replace(/<available_skills>[\s\S]*?<\/available_skills>/g, '')
    .replace(/<\/?(minimax:tool_call|available_skills|available_skins)>/g, '')
    .trim();
}

function sanitizeArgs(args) {
  const a = { ...args };
  if (typeof a.content === 'string' && a.content.length > 160) a.content = `[${a.content.length} chars]`;
  if (typeof a.new_string === 'string' && a.new_string.length > 160) a.new_string = `[${a.new_string.length} chars]`;
  return a;
}

/**
 * Tek bir parse edilmis cagriyi calistir.
 * Donus: { records: [...], feedback: '...' }
 */
async function executeCall(call, opts = {}) {
  const toolsDir = opts.toolsDir || __dirname;
  const loadTool = opts.loadTool || ((n) => require(path.join(toolsDir, n + '.js')));
  const allowed = opts.allowed || new Set(DEFAULT_ALLOWED);
  const rawTool = (call.tool || '').trim();
  const norm = TOOL_ALIASES[rawTool.toLowerCase()] || rawTool;
  const records = [];
  const feedbacks = [];

  // "files" JSON dizisi (bulk-file-operations veya files parametresi) → coklu write_file
  let files = call.args && call.args.files;
  if (typeof files === 'string') { try { files = JSON.parse(files); } catch { files = null; } }
  if (Array.isArray(files) && (/bulk/i.test(rawTool) || /file/i.test(rawTool) || norm === 'write_file')) {
    let wf;
    try { wf = loadTool('write_file'); } catch { wf = null; }
    for (const f of files) {
      if (!wf || !f || !f.path) { records.push({ tool: 'write_file', status: 'error', error: 'gecersiz dosya girisi' }); feedbacks.push('write_file HATA: gecersiz giris'); continue; }
      try {
        const res = await wf.execute({ path: expandHome(f.path), content: f.content != null ? String(f.content) : '' });
        const ok = res && res.success !== false;
        records.push({ tool: 'write_file', status: ok ? 'done' : 'error', args: { path: f.path }, result: res, error: ok ? undefined : (res && res.error) });
        feedbacks.push(ok ? `write_file OK: ${res.path || f.path} (${res.size != null ? res.size : '?'} bytes)` : `write_file HATA: ${res && res.error}`);
      } catch (e) {
        records.push({ tool: 'write_file', status: 'error', args: { path: f.path }, error: e.message });
        feedbacks.push(`write_file HATA: ${e.message}`);
      }
    }
    return { records, feedback: feedbacks.join('\n') };
  }

  if (!allowed.has(norm)) {
    records.push({ tool: rawTool, status: 'error', error: 'Bu modda kullanilamayan arac: ' + rawTool });
    return { records, feedback: `${rawTool}: bu arac bu modda kullanilamaz (izin verilenler: ${[...allowed].join(', ')})` };
  }

  const args = { ...(call.args || {}) };
  for (const k of ['path', 'name', 'command', 'old_string', 'new_string']) {
    if (typeof args[k] === 'string') args[k] = args[k].trim();
  }
  if (args.path) args.path = expandHome(args.path);

  // Ajan modu guvenlik guard'i: yikici/tehlikeli kabuk komutlarini calistirmadan engelle
  if (norm === 'bash') {
    const cmd = (args.command || args.cmd || '').toString();
    if (!cmd.trim()) {
      records.push({ tool: 'bash', status: 'error', error: 'Bos komut' });
      return { records, feedback: 'bash HATA: bos komut' };
    }
    const isDangerous = opts.isDangerous || defaultIsDangerous;
    if (isDangerous(cmd)) {
      records.push({ tool: 'bash', status: 'error', args: { command: cmd }, error: 'Yikici/tehlikeli komut ajan modunda engellendi' });
      return { records, feedback: `bash: "${cmd.slice(0, 80)}" yikici/tehlikeli goruldugu icin ajan tarafindan CALISTIRILMADI. Gerekirse kullanici komutu kendisi calistirabilir.` };
    }
  }

  let mod;
  try { mod = loadTool(norm); } catch {
    records.push({ tool: rawTool, status: 'error', error: 'Bilinmeyen arac: ' + rawTool });
    return { records, feedback: `${rawTool} HATA: bilinmeyen arac` };
  }
  const fn = mod.execute || (mod.default && mod.default.execute);
  if (typeof fn !== 'function') {
    records.push({ tool: norm, status: 'error', error: 'execute yok' });
    return { records, feedback: `${norm} HATA: execute fonksiyonu yok` };
  }
  try {
    const res = await fn(args);
    let feedback, status;
    if (typeof res === 'string') {
      status = 'done';
      feedback = `${norm} sonucu:\n` + res.slice(0, 1500);
    } else {
      const ok = res && res.success !== false;
      status = ok ? 'done' : 'error';
      feedback = ok
        ? `${norm} OK` + (res.path ? `: ${res.path} (${res.size != null ? res.size : '?'} bytes)` : (res.output ? ': ' + String(res.output).slice(0, 300) : ''))
        : `${norm} HATA: ${res && res.error}`;
    }
    records.push({ tool: norm, status, args: sanitizeArgs(args), result: res });
    return { records, feedback };
  } catch (e) {
    records.push({ tool: norm, status: 'error', args: sanitizeArgs(args), error: e.message });
    return { records, feedback: `${norm} HATA: ${e.message}` };
  }
}

/**
 * Ana agentic dongu.
 * callModel(messages) => Promise<{ content, toolCalls }>
 * Donus: { records, reply, iterations }
 */
async function runAgentic({ callModel, systemPrompt, historyMessages, task, toolsDir, loadTool, allowed, maxIterations = 15 }) {
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const mm of historyMessages || []) messages.push({ role: mm.role, content: mm.content || '' });
  messages.push({ role: 'user', content: task });

  const allowedSet = allowed ? new Set(allowed) : new Set(DEFAULT_ALLOWED);
  const allRecords = [];
  let finalReply = '';
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    const { content, toolCalls } = await callModel(messages);
    const calls = parseAgenticCalls(content, toolCalls);

    if (calls.length === 0) {
      finalReply = stripProtocolTokens(content);
      break;
    }

    messages.push({ role: 'assistant', content: content || '' });
    const feedbacks = [];
    for (const call of calls) {
      const { records, feedback } = await executeCall(call, { toolsDir, loadTool, allowed: allowedSet });
      allRecords.push(...records);
      feedbacks.push(feedback);
    }
    messages.push({
      role: 'user',
      content: '<tool_results>\n' + feedbacks.join('\n') + '\n</tool_results>\nGorev tamamlandiysa ARAC CAGIRMADAN tek cumlelik ozet yaz. Devam gerekiyorsa sonraki araci cagir.',
    });

    if (i === maxIterations - 1) {
      finalReply = stripProtocolTokens(content) || 'Islem maksimum adima ulasti.';
    }
  }

  return { records: allRecords, reply: finalReply, iterations };
}

module.exports = { parseAgenticCalls, stripProtocolTokens, executeCall, runAgentic, expandHome, TOOL_ALIASES, DEFAULT_ALLOWED };
