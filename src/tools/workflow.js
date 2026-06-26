const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKFLOW_DIR = path.join(os.homedir(), '.natureco', 'workflows');
const WORKFLOW_HISTORY = path.join(os.homedir(), '.natureco', 'workflow-history.json');

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

async function workflow(params) {
  const { action, task, steps, name, workflowId, regenerateStep } = params;
  const cfg = loadConfig();
  const tools = allToolNames();
  ensureDir(WORKFLOW_DIR);

  const providerUrl = cfg.providerUrl;
  const providerApiKey = cfg.providerApiKey;
  const model = cfg.providerModel || 'default';

  if (!providerUrl || !providerApiKey) {
    return { success: false, error: 'Provider ayarli degil. Once: natureco setup' };
  }

  // ── RUN: Execute a complete workflow ──────────────────────────────────
  if (action === 'run') {
    if (!task) return { success: false, error: 'task gerekli' };

    // Phase 0: Check if simple chat (passthrough) — no planning needed
    const simpleCheckPrompt = {
      role: 'system',
      content: 'Gorevin basit bir selamlasma/sohbet mi yoksa arac gerektiren bir islem mi oldugunu belirle. Sadece "simple" veya "complex" yaz, kesinlikle baska bir sey yazma. Noktalama isareti koyma.\n\nSimple: selamlasma, nasilsin, bugun ne yaptin, havadan sudan, genel bilgi sorusu\nComplex: dosya islemleri, kod yazma, arastirma, karsilastirma, duzenleme, otomasyon, proje yonetimi, debug'
    };
    const simpleBody = { model, stream: false, messages: [simpleCheckPrompt, { role: 'user', content: task }], temperature: 0, max_tokens: 20 };
    let isSimple = false;
    try {
      const simpleResult = await apiCall(providerUrl, providerApiKey, simpleBody);
      const raw = (simpleResult.choices?.[0]?.message?.content || '').trim().toLowerCase().replace(/[^a-z]/g, '');
      isSimple = raw === 'simple';
    } catch {}

    if (isSimple) {
      // Passthrough: just chat with LLM, no tools
      const chatBody = { model, stream: false, messages: [{ role: 'system', content: 'Sen yardimci bir asistansin. Kisa ve oz yanit ver.' }, { role: 'user', content: task }], temperature: 0.7, max_tokens: 1000 };
      try {
        const chatResult = await apiCall(providerUrl, providerApiKey, chatBody);
        const reply = chatResult.choices?.[0]?.message?.content || '';
        return { success: true, workflowId: 'passthrough', name: 'Direct Chat', status: 'completed', totalSteps: 0, completedSteps: 0, results: [{ step: 0, tool: 'chat', status: 'done', result: { reply } }], passthrough: true, reply };
      } catch (e) {
        return { success: false, error: 'Sohbet yaniti alinamadi: ' + e.message };
      }
    }

    // Phase 1: LLM plans the workflow
    const planPrompt = {
      role: 'system',
      content: 'Sen bir workflow planlama asistanisin. Verilen gorev icin hangi tool\'larin kullanilacagini ve hangi sirayla calisacagini belirle. SADECE JSON formatinda yanit ver, baska bir sey yazma.\n\nKullanilabilir tool\'lar:\n' +
        tools.map(t => '- ' + t).join('\n') +
        '\n\nJSON format:\n{\n  "workflowName": "...",\n  "description": "...",\n  "steps": [\n    { "step": 1, "tool": "tool_name", "purpose": "...", "params": { ... } }\n  ]\n}\n\nHer adim icin params kismina tool\'un gerektirdigi parametreleri ekle. Adimlar birbirine bagimli olabilir, onceki adimin outputu sonraki adimin inputu olarak kullanilabilir.'
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
      return { success: false, error: 'Plan cozumlenemedi: ' + e.message, raw: planResult.choices?.[0]?.message?.content?.slice(0, 500) };
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
          '\n\nTek bir tool cagrisi yap ve sonucu bekle. Tool cagrisi yaparken Onceki adim sonuclarindaki gerekli verileri parametre olarak kullan.'
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

    return {
      success: true,
      workflowId: wfId,
      name: plan.workflowName || '',
      description: plan.description || '',
      totalSteps: plan.steps.length,
      completedSteps: stepResults.filter(r => r.status === 'done').length,
      failedSteps: stepResults.filter(r => r.status === 'error' || r.status === 'skipped').length,
      status: wfEntry.status,
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
        '\n\nGorev icin bir workflow plani JSON formatinda olustur. JSON disinda hicbir sey yazma.\nFormat: { "workflowName": "...", "description": "...", "estimatedSteps": N, "steps": [{ "step": 1, "tool": "...", "purpose": "...", "params": {...}, "expectedOutput": "..." }] }'
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
  description: '[ORCHESTRATOR] Cok adimli is akisi: gorev ver, AI en uygun tool\'lari secer ve sirayla calistirir. Plan/run/save/load/list/delete/retry.',
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
    },
    required: ['action'],
  },
  async execute(params) { return await workflow(params); },
};
