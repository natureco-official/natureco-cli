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
const { buildChatEndpoint } = require('../utils/provider-detect');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
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

function screenshotBase64() {
  if (os.platform() !== 'darwin') throw new Error('computer_use_loop currently requires macOS');
  const file = path.join(os.tmpdir(), 'ncloop_' + Date.now() + '.png');
  require('child_process').execSync('screencapture -x "' + file + '"', { timeout: 5000 });
  const buf = fs.readFileSync(file);
  fs.unlinkSync(file);
  return buf.toString('base64');
}

function executeAction(action, params) {
  const { spawnSync } = require('child_process');
  const PLATFORM = os.platform();

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

Sadece JSON yanit ver, baska metin ekleme. Her action'dan sonra otomatik screenshot alinir, sen sadece bir sonraki en mantikli adimi soyle.`;

async function loop(goal, maxSteps) {
  const cfg = loadConfig();
  const providerUrl = cfg.providerUrl;
  const apiKey = cfg.providerApiKey;
  const model = cfg.providerModel || 'default';

  if (!providerUrl || !apiKey) {
    return { success: false, error: 'Provider not configured' };
  }

  if (os.platform() !== 'darwin') {
    return { success: false, error: 'computer_use_loop currently requires macOS' };
  }

  const steps = [];
  let completed = false;
  for (let i = 0; i < maxSteps; i++) {
    try {
      // 1. Screenshot
      const b64 = screenshotBase64();
      steps.push({ step: i + 1, action: 'screenshot' });

      // 2. LLM vision analysis
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      const history = steps.filter(s => s.action && s.action !== 'screenshot' && s.action !== 'done').slice(-5);
      if (history.length > 0) {
        messages.push({ role: 'user', content: 'Onceki adimlar:\n' + history.map(h =>
          'Adim ' + h.step + ': ' + JSON.stringify(h)
        ).join('\n') });
      }

      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Gorev: ' + goal + '\n\nEkran goruntusunu analiz et. Siradaki action ne?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
        ],
      });

      const body = {
        model,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 500,
      };

      const result = await apiCall(providerUrl, apiKey, body);
      const reply = result.choices?.[0]?.message?.content || '';
      let decision;
      try {
        decision = JSON.parse(reply);
      } catch {
        const m = reply.match(/\{[\s\S]*\}/);
        decision = m ? JSON.parse(m[0]) : { action: 'wait' };
      }

      if (!decision.action) decision.action = 'wait';

      // 3. Execute
      if (decision.action === 'done') {
        steps.push({ step: i + 1, action: 'done', reason: decision.reason || 'Goal achieved' });
        completed = true;
        break;
      }

      const execResult = executeAction(decision.action, decision);
      steps.push({ step: i + 1, action: decision.action, params: decision, result: execResult.success });

      if (!execResult.success) {
        // Retry once with wait
        require('child_process').execSync('sleep 1');
        const retryResult = executeAction(decision.action, decision);
        if (!retryResult.success) {
          steps.push({ step: i + 1, action: 'error', error: execResult.error });
          return { success: false, error: execResult.error, goal, totalSteps: steps.length, steps };
        }
      }

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
    return { success: false, error: 'Goal was not verified', goal, totalSteps: steps.length, steps };
  }
  return { success: true, goal, totalSteps: steps.length, steps };
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

module.exports = { name, description, parameters, execute, executeAction };
