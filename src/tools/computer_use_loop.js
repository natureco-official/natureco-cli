/**
 * computer_use_loop — Autonomous GUI interaction with visual feedback loop
 *
 * Takes a goal → loops: screenshot → LLM vision analysis → execute action →
 * screenshot → verify → repeat until goal achieved.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { buildChatEndpoint, isMiniMax, isAnthropic } = require('../utils/provider-detect');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
}

function resolveVisionConfig(cfg) {
  const main = {
    providerUrl: cfg.providerUrl,
    apiKey: cfg.providerApiKey,
    model: cfg.providerModel || 'default',
  };
  const explicit = cfg.guiVisionProviderUrl && cfg.guiVisionApiKey && cfg.guiVisionModel
    ? { providerUrl: cfg.guiVisionProviderUrl, apiKey: cfg.guiVisionApiKey, model: cfg.guiVisionModel }
    : null;
  if (explicit) return { success: true, ...explicit, dedicated: true };
  if (isMiniMax(main.providerUrl) || /^MiniMax-M/i.test(main.model)) {
    if (!main.providerUrl || !main.apiKey) return { success: false, error: 'Provider not configured' };
    return { success: true, ...main, dedicated: false, transport: 'minimax-vlm' };
  }
  if (!main.providerUrl || !main.apiKey) return { success: false, error: 'Provider not configured' };
  return { success: true, ...main, dedicated: false };
}

async function visionCall(providerUrl, apiKey, model, prompt, screenshot) {
  if (isMiniMax(providerUrl) || /^MiniMax-M/i.test(model)) {
    const base = providerUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
    const response = await fetch(base + '/v1/coding_plan/vlm', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_url: 'data:image/png;base64,' + screenshot.base64 }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('MiniMax VLM HTTP ' + response.status + ': ' + (await response.text()).slice(0, 300));
    const data = await response.json();
    if (data.base_resp?.status_code) throw new Error(data.base_resp.status_msg || 'MiniMax VLM request failed');
    return String(data.content || '');
  }

  if (isAnthropic(providerUrl) || /^claude-/i.test(model)) {
    const origin = new URL(providerUrl).origin;
    const response = await fetch(origin + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.base64 } },
          { type: 'text', text: prompt },
        ] }],
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('Anthropic vision HTTP ' + response.status + ': ' + (await response.text()).slice(0, 300));
    const data = await response.json();
    return String(data.content?.find(item => item.type === 'text')?.text || '');
  }

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + screenshot.base64 } },
    ],
  }];
  const result = await apiCall(providerUrl, apiKey, { model, messages, stream: false, temperature: 0, max_tokens: 500 });
  return String(result.choices?.[0]?.message?.content || '');
}

function apiCall(providerUrl, apiKey, body) {
  return new Promise((resolve, reject) => {
    const endpoint = buildChatEndpoint(providerUrl);
    const req = https.request(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); }
        } else reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 500)));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function captureScreenshot() {
  if (os.platform() !== 'darwin') throw new Error('computer_use_loop currently requires macOS');
  const file = path.join(os.tmpdir(), 'ncloop_' + Date.now() + '.png');
  require('child_process').execSync('screencapture -x "' + file + '"', { timeout: 5000 });
  const buf = fs.readFileSync(file);
  fs.unlinkSync(file);
  return {
    base64: buf.toString('base64'),
    hash: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

function evaluateCompletionEvidence({ mutationCount, initialHash, currentHash, verification }) {
  if (mutationCount < 1) return { verified: false, error: 'No state-changing GUI action was executed' };
  if (!initialHash || !currentHash || initialHash === currentHash) {
    return { verified: false, error: 'The screen did not change after GUI actions' };
  }
  if (!verification || verification.verified !== true) {
    return { verified: false, error: verification?.reason || 'Visual verifier could not confirm the goal' };
  }
  const confidence = Number(verification.confidence || 0);
  if (confidence < 0.8 || !String(verification.evidence || '').trim()) {
    return { verified: false, error: 'Visual verification evidence was insufficient' };
  }
  return { verified: true, evidence: String(verification.evidence).trim(), confidence };
}

async function verifyGoal(providerUrl, apiKey, model, goal, screenshot) {
  const prompt = `You are a strict independent verifier. Inspect only the screenshot. Goal: ${goal}\nReturn JSON only: {"verified":boolean,"confidence":0..1,"evidence":"exact visible evidence","reason":"why not"}. Never infer success from the goal text. If the requested sent message, booking, purchase, or confirmation is not visibly present, verified must be false.`;
  const reply = await visionCall(providerUrl, apiKey, model, prompt, screenshot);
  const parsed = parseVisionDecision(reply);
  return parsed.success ? parsed.value : { verified: false, confidence: 0, reason: 'Verifier returned invalid JSON: ' + parsed.error };
}

function parseVisionDecision(reply) {
  const raw = String(reply || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const candidates = [raw];
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return { success: true, value };
    } catch {}
  }
  return { success: false, error: raw ? 'malformed or truncated JSON' : 'empty vision response' };
}

function validateAction(action, params = {}) {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  if (!['click', 'type', 'keypress', 'mouse_move', 'scroll', 'wait', 'done'].includes(action)) return 'Unknown action: ' + action;
  if ((action === 'click' || action === 'mouse_move') && (!finite(params.x) || !finite(params.y))) return action + ' requires finite numeric x and y';
  if (action === 'scroll' && !finite(params.y)) return 'scroll requires a finite numeric y';
  if (action === 'type' && typeof params.text !== 'string') return 'type requires text';
  if (action === 'keypress' && (typeof params.key !== 'string' || !params.key.trim())) return 'keypress requires key';
  return null;
}

function executeAction(action, params) {
  const { spawnSync } = require('child_process');
  const PLATFORM = os.platform();

  const invalid = validateAction(action, params);
  if (invalid) return { success: false, error: invalid };
  const ESC = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  function osaScript(script, timeoutMs = 10000) {
    const r = spawnSync('osascript', ['-e', script], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (r.error) return { success: false, error: r.error.code === 'ETIMEDOUT' ? 'osascript timed out' : r.error.message };
    if (r.status !== 0) return { success: false, error: r.stderr || r.stdout || 'error' };
    return { success: true };
  }

  try {
    switch (action) {
      case 'click':
        return osaScript('tell application "System Events" to click at {' + params.x + ', ' + params.y + '}');
      case 'type':
        return osaScript('tell application "System Events" to keystroke "' + ESC(params.text) + '"');
      case 'keypress': {
        const KEY_CODES = { enter: 36, return: 36, tab: 48, escape: 53, up: 126, down: 125, left: 123, right: 124, backspace: 51, delete: 117, space: 49 };
        const MOD_MAP = { cmd: 'command down', command: 'command down', option: 'option down', alt: 'option down', ctrl: 'control down', shift: 'shift down' };
        const parts = params.key.toLowerCase().split('+').map(p => p.trim());
        const mods = [];
        let actual = '';
        for (const p of parts) {
          if (MOD_MAP[p]) mods.push(MOD_MAP[p]);
          else actual = p;
        }
        const using = mods.length > 0 ? ' using {' + mods.join(', ') + '}' : '';
        if (Object.prototype.hasOwnProperty.call(KEY_CODES, actual)) {
          return osaScript('tell application "System Events" to key code ' + KEY_CODES[actual] + using);
        }
        if (!actual) return { success: false, error: 'A key is required with the modifier' };
        return osaScript('tell application "System Events" to keystroke "' + ESC(actual) + '"' + using);
      }
      case 'mouse_move':
        return osaScript('tell application "System Events" to set position of mouse to {' + params.x + ', ' + params.y + '}');
      case 'scroll': {
        const times = Math.abs(Math.ceil((params.y || 0) / 40));
        return osaScript('tell application "System Events"\n  repeat ' + times + ' times\n    key code 125\n  end repeat\nend tell');
      }
      case 'wait':
        return { success: true };
      default:
        return { success: false, error: 'Unknown action: ' + action };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

const SYSTEM_PROMPT = `Sen bir GUI otomasyon asistanisin. Gorev: Ekran goruntusunu analiz et ve siradaki action'i JSON olarak belirle.

Actions:
- click: { "action": "click", "x": sayi, "y": sayi }
- type: { "action": "type", "text": "yazilacak metin" }
- keypress: { "action": "keypress", "key": "enter|tab|escape|up|down|left|right|backspace|cmd+q|alt+space" }
- mouse_move: { "action": "mouse_move", "x": sayi, "y": sayi }
- scroll: { "action": "scroll", "y": piksel_sayisi (positive=down, negative=up) }
- wait: { "action": "wait" }
- done: { "action": "done", "reason": "gorev tamamlandi" }

"done" yalnız görev sonucunu mevcut ekranda açıkça görüyorsan kullanılabilir. Bir mesajı yazmak gönderildiği anlamına gelmez; gönderilen mesajın konuşmada görünmesi gerekir.
Sadece JSON yanit ver, baska metin ekleme. Her action'dan sonra otomatik screenshot alinir, sen sadece bir sonraki en mantikli adimi soyle.`;

async function loop(goal, maxSteps) {
  const cfg = loadConfig();
  const vision = resolveVisionConfig(cfg);
  if (!vision.success) return vision;
  const { providerUrl, apiKey, model } = vision;

  if (os.platform() !== 'darwin') {
    return { success: false, error: 'computer_use_loop currently requires macOS' };
  }

  const steps = [];
  let completed = false;
  let initialHash = null;
  let mutationCount = 0;
  let completionEvidence = null;
  for (let i = 0; i < maxSteps; i++) {
    try {
      // 1. Screenshot
      const screenshot = captureScreenshot();
      if (!initialHash) initialHash = screenshot.hash;
      steps.push({ step: i + 1, action: 'screenshot' });

      // 2. LLM vision analysis
      const history = steps.filter(s => s.action && s.action !== 'screenshot' && s.action !== 'done').slice(-5);
      const historyText = history.length > 0 ? '\nOnceki adimlar:\n' + history.map(h => 'Adim ' + h.step + ': ' + JSON.stringify(h)).join('\n') : '';
      const reply = await visionCall(providerUrl, apiKey, model, SYSTEM_PROMPT + '\n\nGorev: ' + goal + historyText + '\n\nEkran goruntusunu analiz et. Siradaki action ne?', screenshot);
      const parsedDecision = parseVisionDecision(reply);
      if (!parsedDecision.success) {
        steps.push({ step: i + 1, action: 'vision_retry', error: parsedDecision.error });
        continue;
      }
      const decision = parsedDecision.value;
      const invalidDecision = validateAction(decision.action, decision);
      if (invalidDecision) {
        steps.push({ step: i + 1, action: 'vision_retry', error: invalidDecision });
        continue;
      }

      // 3. Execute
      if (decision.action === 'done') {
        const verification = await verifyGoal(providerUrl, apiKey, model, goal, screenshot);
        const evidence = evaluateCompletionEvidence({ mutationCount, initialHash, currentHash: screenshot.hash, verification });
        if (evidence.verified) {
          steps.push({ step: i + 1, action: 'verified', evidence: evidence.evidence, confidence: evidence.confidence });
          completionEvidence = evidence;
          completed = true;
          break;
        }
        steps.push({ step: i + 1, action: 'verification_failed', error: evidence.error });
        continue;
      }

      const execResult = executeAction(decision.action, decision);
      const safeParams = decision.action === 'type' ? { action: 'type', text: '[redacted]' } : decision;
      steps.push({ step: i + 1, action: decision.action, params: safeParams, result: execResult.success });

      if (!execResult.success) {
        // Retry once with wait
        require('child_process').execSync('sleep 1');
        const retryResult = executeAction(decision.action, decision);
        if (!retryResult.success) {
          steps.push({ step: i + 1, action: 'error', error: execResult.error });
          return { success: false, error: execResult.error, goal, totalSteps: steps.length, steps };
        }
      }
      if (['click', 'type', 'keypress', 'scroll', 'drag'].includes(decision.action)) mutationCount++;

      // Small delay between actions
      require('child_process').execSync('sleep 0.5');

      // Safety: if too many steps, break
      if (i >= maxSteps - 1) {
        steps.push({ step: i + 1, action: 'error', error: 'Max steps reached before the goal was verified' });
      }
    } catch (e) {
      steps.push({ step: i + 1, action: 'error', error: e.message });
      break;
    }
  }

  if (!completed) {
    const lastFailure = [...steps].reverse().find(step => step.error);
    const detail = lastFailure?.error || 'No visible completion evidence was produced';
    return { success: false, error: 'Goal was not verified: ' + detail, goal, totalSteps: steps.length, steps };
  }
  return { success: true, verified: true, evidence: completionEvidence.evidence, confidence: completionEvidence.confidence, goal, totalSteps: steps.length, steps };
}

const name = 'computer_use_loop';
const description = 'Otonom GUI etkilesimi: bir hedef ver, loop halinde screenshot → LLM analizi → action → screenshot... hedef tamamlanana kadar devam eder. Web formlari, login, menus islemleri icin ideal.';
const parameters = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: 'Yapilacak islem (ornek: "natureco.me/login sayfasinda kullanici adi ve sifre girerek giris yap")' },
    maxSteps: { type: 'number', description: 'Maksimum adim sayisi (default: 30)' },
  },
  required: ['goal'],
};

async function execute(params) {
  return await loop(params.goal, params.maxSteps || 30);
}

module.exports = { name, description, parameters, execute, executeAction, evaluateCompletionEvidence, resolveVisionConfig, visionCall, parseVisionDecision, validateAction };
