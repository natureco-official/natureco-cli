/**
 * browser_use — Cloud browser automation via Browser Use
 *
 * Two modes:
 *   1) API mode (default): Browser Use cloud API — create sessions with task descriptions,
 *      autonomous browsing, screenshots, structured output
 *   2) CLI mode: wraps `browser-use` CLI for direct terminal-driven browser control
 *
 * API: https://api.browser-use.com/api/v3
 * Docs: https://docs.browser-use.com
 */

const https = require('https');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_URL = 'https://api.browser-use.com/api/v3';

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
}

function getApiKey() {
  const cfg = loadConfig();
  return cfg.browserUseApiKey || cfg.BROWSER_USE_API_KEY || process.env.BROWSER_USE_API_KEY || '';
}

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();
    if (!apiKey) return reject(new Error('BROWSER_USE_API_KEY gerekli. Sign up: https://cloud.browser-use.com'));

    const fullUrl = BASE_URL + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
    const url = new URL(fullUrl);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'X-Browser-Use-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error: ' + data.slice(0, 200))); }
        } else {
          let detail = data;
          try { detail = JSON.parse(data)?.detail || data; } catch {}
          reject(new Error('HTTP ' + res.statusCode + ': ' + JSON.stringify(detail).slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function checkCli() {
  const r = spawnSync('which', ['browser-use'], { timeout: 3000, encoding: 'utf8' });
  return r.status === 0;
}

function cliExec(args) {
  const r = spawnSync('browser-use', args, { timeout: 60000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (r.error) return { success: false, error: r.error.message };
  if (r.status !== 0) return { success: false, error: r.stderr || r.stdout || 'CLI error' };
  return { success: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

async function handleApiAction(params) {
  const { action } = params;

  if (action === 'browse') {
    if (!params.task) return { success: false, error: 'task gerekli (ornek: "github.com/ac, en populer repo\'lari listele")' };

    const result = await apiRequest('POST', '/sessions', {
      task: params.task,
      ...(params.persistentSession ? { persistent_session: params.persistentSession } : {}),
    });

    const sessionId = result.session_id || result.id || result.data?.session_id || result.data?.id;
    if (!sessionId) return { success: false, error: 'Session ID alinamadi: ' + JSON.stringify(result).slice(0, 300) };

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await apiRequest('GET', '/sessions/' + sessionId);
      if (status.status === 'completed' || status.status === 'finished' || status.status === 'stopped' || status.data?.status === 'completed') {
        return {
          success: status.isTaskSuccessful !== false,
          mode: 'api',
          sessionId,
          result: status.output || status.result || status.data?.result || status,
          summary: status.lastStepSummary || status.summary || status.data?.summary || '',
          steps: status.steps || status.data?.steps || [],
          screenshotUrl: status.screenshotUrl || null,
          liveUrl: status.liveUrl || null,
        };
      }
      if (status.status === 'failed' || status.status === 'error' || status.status === 'cancelled') {
        return { success: false, error: 'Session failed: ' + JSON.stringify(status.error || status) };
      }
    }
    return { success: false, error: 'Session timeout after 120s', sessionId };
  }

  if (action === 'status') {
    if (!params.sessionId) return { success: false, error: 'sessionId gerekli' };
    const status = await apiRequest('GET', '/sessions/' + params.sessionId);
    return { success: true, sessionId: params.sessionId, status };
  }

  if (action === 'cancel' || action === 'delete') {
    if (!params.sessionId) return { success: false, error: 'sessionId gerekli' };
    await apiRequest('DELETE', '/sessions/' + params.sessionId);
    return { success: true, action: 'cancel', sessionId: params.sessionId };
  }

  if (action === 'self_signup') {
    const r = cliExec(['cloud', 'signup']);
    if (!r.success) return r;
    const challengeMatch = r.stdout.match(/Challenge ID:\s*(\S+)/);
    const challengeMatch2 = r.stdout.match(/Challenge:\s*(.+)/);
    if (!challengeMatch || !challengeMatch2) return { success: false, error: 'Signup baslatilamadi', cliOutput: r.stdout };
    return {
      success: true,
      action: 'challenge',
      challengeId: challengeMatch[1],
      challenge: challengeMatch2[1],
      note: 'Challenge\'i LLM ile coz, sonra verify icin: browser_use(action="self_verify", challengeId="...", answer="...")',
    };
  }

  if (action === 'self_verify') {
    if (!params.challengeId || !params.answer) return { success: false, error: 'challengeId ve answer gerekli' };
    const r = cliExec(['cloud', 'signup', '--verify', params.challengeId, String(params.answer)]);
    if (!r.success) return r;
    return { success: true, action: 'verified', note: 'API key kaydedildi. browser_use kullanima hazir.' };
  }

  return { success: false, error: 'Bilinmeyen action: ' + action + ' (browse, status, cancel, self_signup, self_verify)' };
}

async function handleCliAction(params) {
  const { action } = params;

  if (action === 'navigate') {
    if (!params.url) return { success: false, error: 'url gerekli' };
    return cliExec(['navigate', params.url]);
  }

  if (action === 'click') {
    if (params.selector) return cliExec(['click', params.selector]);
    if (typeof params.x === 'number' && typeof params.y === 'number') {
      return cliExec(['click', '--x', String(params.x), '--y', String(params.y)]);
    }
    return { success: false, error: 'selector veya x,y gerekli' };
  }

  if (action === 'type') {
    if (!params.selector || !params.text) return { success: false, error: 'selector ve text gerekli' };
    return cliExec(['type', params.selector, params.text]);
  }

  if (action === 'screenshot') {
    const outFile = params.file || path.join(os.tmpdir(), 'browser_use_' + Date.now() + '.png');
    const r = cliExec(['screenshot', '--output', outFile]);
    if (!r.success) return r;
    const b64 = fs.readFileSync(outFile).toString('base64');
    if (!params.file) fs.unlinkSync(outFile);
    return { success: true, action: 'screenshot', file: outFile, base64: b64 };
  }

  if (action === 'extract') {
    if (!params.selector) return { success: false, error: 'selector gerekli' };
    return cliExec(['extract', params.selector]);
  }

  if (action === 'evaluate') {
    if (!params.script) return { success: false, error: 'script gerekli' };
    return cliExec(['evaluate', params.script]);
  }

  if (action === 'html') {
    const r = cliExec(['html']);
    return { success: true, html: r.stdout };
  }

  if (action === 'current_url') {
    const r = cliExec(['current-url']);
    return { success: true, url: r.stdout };
  }

  if (action === 'session') {
    if (params.sessionAction === 'list') return cliExec(['session', 'list']);
    if (params.sessionAction === 'save') return cliExec(['session', 'save', params.name || 'default']);
    if (params.sessionAction === 'load') return cliExec(['session', 'load', params.name || 'default']);
    if (params.sessionAction === 'close') return cliExec(['session', 'close']);
    return cliExec(['session']);
  }

  if (action === 'cloud_login') {
    if (!params.apiKey) return { success: false, error: 'apiKey gerekli' };
    return cliExec(['cloud', 'login', params.apiKey]);
  }

  if (action === 'cloud_status') {
    return cliExec(['cloud', 'status']);
  }

  if (action === 'doctor') {
    return cliExec(['doctor']);
  }

  if (action === 'help') {
    const r = cliExec(['--help']);
    return { success: true, help: r.stdout };
  }

  return { success: false, error: 'Bilinmeyen CLI action: ' + action };
}

const name = 'browser_use';
const description = 'Bulut tarayici otomasyonu — Browser Use altyapisi ile web islemleri. API modu: task tanimla, otonom yapilsin. CLI modu: direkt tarayici kontrolu (navigate, click, type, screenshot).';
const inputSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description: 'API actions: browse (task ile otonom), status, cancel, self_signup, self_verify. CLI actions: navigate, click, type, screenshot, extract, evaluate, html, current_url, session, cloud_login, cloud_status, doctor, help',
      enum: ['browse', 'status', 'cancel', 'self_signup', 'self_verify', 'navigate', 'click', 'type', 'screenshot', 'extract', 'evaluate', 'html', 'current_url', 'session', 'cloud_login', 'cloud_status', 'doctor', 'help'],
    },
    task: { type: 'string', description: '(API browse) Yapilacak is — dogal dilde, ornek: "github.com/trending ac, en populer 3 repoyu ozetle"' },
    sessionId: { type: 'string', description: '(API status/cancel) Session ID' },
    persistentSession: { type: 'string', description: '(API browse) Persistent session ID — login/cerezleri korur' },
    url: { type: 'string', description: '(CLI navigate) Hedef URL' },
    selector: { type: 'string', description: '(CLI click/type/extract) CSS selector, ornek: #username, button[type=submit]' },
    text: { type: 'string', description: '(CLI type) Yazilacak metin' },
    script: { type: 'string', description: '(CLI evaluate) Calistirilacak JavaScript' },
    x: { type: 'number', description: '(CLI click) X koordinati' },
    y: { type: 'number', description: '(CLI click) Y koordinati' },
    file: { type: 'string', description: '(CLI screenshot) Kayit dosyasi' },
    name: { type: 'string', description: '(CLI session save/load) Session adi' },
    sessionAction: { type: 'string', description: '(CLI session) list, save, load, close', enum: ['list', 'save', 'load', 'close'] },
    apiKey: { type: 'string', description: '(CLI cloud_login) Browser Use API key' },
    challengeId: { type: 'string', description: '(API self_verify) Challenge ID from self_signup' },
    answer: { type: 'string', description: '(API self_verify) Challenge cozumu (2 ondalikli sayi)' },
  },
  required: ['action'],
};

async function execute(params) {
  const { action } = params;

  const apiActions = ['browse', 'status', 'cancel', 'self_signup', 'self_verify'];
  const cliActions = ['navigate', 'click', 'type', 'screenshot', 'extract', 'evaluate', 'html', 'current_url', 'session', 'cloud_login', 'cloud_status', 'doctor', 'help'];

  if (apiActions.includes(action)) {
    return await handleApiAction(params);
  }

  if (cliActions.includes(action)) {
    if (!checkCli()) {
      return { success: false, error: 'browser-use CLI bulunamadi. Kur: curl -fsSL https://browser-use.com/cli/install.sh | bash', cliRequired: true };
    }
    const result = await handleCliAction(params);
    return result;
  }

  return { success: false, error: 'Bilinmeyen action: ' + action };
}

module.exports = { name, description, inputSchema, execute };
