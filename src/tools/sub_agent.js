/**
 * sub_agent — Spawn a sub-agent for delegated sub-tasks
 *
 * Creates a child agent with its own LLM call to handle a specific sub-task.
 * Returns the sub-agent's response. Useful for parallel research, complex
 * sub-problems, or when a focused agent is better than the main loop.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8')); } catch { return {}; }
}

function isMiniMax(url) { return url && (url.includes('minimax.io') || url.includes('minimaxi.com') || url.includes('minimax.cn')); }
function isGemini(url) { return url && (url.includes('generativelanguage.googleapis.com') || url.includes('gemini')); }

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
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); }
        } else reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 300)));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

const name = 'sub_agent';
const description = 'Spawn a sub-agent to handle a specific sub-task independently. Returns the sub-agent\'s response. Use for parallel research, focused debugging, or complex sub-problems.';
const parameters = {
  type: 'object',
  properties: {
    task: { type: 'string', description: 'The sub-task for the sub-agent to complete' },
    context: { type: 'string', description: 'Additional context or background information' },
    model: { type: 'string', description: 'Override model for this sub-agent (default: main config model)' },
    temperature: { type: 'number', description: 'Temperature 0-1 (default: 0.3)' },
    maxTokens: { type: 'number', description: 'Max tokens for response (default: 2000)' },
  },
  required: ['task'],
};

async function execute(params) {
  const cfg = loadConfig();
  const providerUrl = cfg.providerUrl;
  const providerApiKey = cfg.providerApiKey;
  const model = params.model || cfg.providerModel || 'default';

  if (!providerUrl || !providerApiKey) {
    return JSON.stringify({ success: false, error: 'Provider not configured. Run natureco setup first.' });
  }

  const systemContent = 'Sen bir alt-agentsin. Verilen gorevi tamamlamak icin elinden geleni yap. Kisa ve oz yanit ver.'
    + (params.context ? '\n\nContext:\n' + params.context : '');

  const body = {
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: params.task },
    ],
    stream: false,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens || 2000,
  };

  try {
    const result = await apiCall(providerUrl, providerApiKey, body);
    const reply = result.choices?.[0]?.message?.content || '';
    return JSON.stringify({ success: true, response: reply, model });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

module.exports = { name, description, parameters, execute };
