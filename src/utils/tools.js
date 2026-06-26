/**
 * NatureCo CLI — Tool Definitions for OpenAI-compatible APIs
 *
 * src/tools/*.js dosyalarını OpenAI uyumlu function calling format'ına dönüştürür.
 * v5.7.17: Emoji + toolset + check_fn + registry entegrasyonu.
 */

const fs = require('fs');
const path = require('path');
const { globalRegistry } = require('./registry');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// ── Emoji map (central, tek kaynak) ──────────────────────────────────────
const EMOJI_MAP = {
  // File operations
  read_file: '📖', write_file: '✏️', edit_file: '🖊️', list_dir: '📂', file_search: '🔍', grep_search: '🔎', filesystem: '🗄️',
  // Terminal
  bash: '💻', shell_command: '⌨️',
  // Web
  duckduckgo: '🦆', duckduckgo_search: '🦆', web_search: '🌐', web_readability: '📄', firecrawl: '🔥', searxng: '🔬', searxng_search: '🔬', http_request: '🌍', http: '🌍', exa_search: '🔬', parallel_search: '⚡',
  // Browser
  browser: '🖥️', browser_use: '🌐',
  // Memory
  memory: '🧠', memory_write: '🧠', memory_search: '🔍',
  // Skills
  skill_view: '📚', skills_list: '📋', skill_generate: '✨', skills_autoload: '🔄', skills_marketplace: '🏪', skill_manage: '🛠️',
  // Agent
  delegate_task: '👥', llm_task: '🤖', sub_agent: '👤',
  // Documents
  document_extract: '📄', notebook_edit: '📓', notes_add: '📝',
  // Git
  git: '🔀',
  // Plan / Todo
  plan: '📋', todo_write: '✅',
  // Media
  image_generation: '🎨', video_generation: '🎬', music_generation: '🎵', media_understanding: '📺', text_to_speech: '🔊', speech_to_text: '🎤', voice_chat: '🗣️',
  // macOS
  mac_alarm: '⏰', mac_app_open: '🚀', mac_app_quit: '⏹️', mac_notify: '🔔', macos_screenshot: '📸', phone_control: '📱', phone_control_enhanced: '📱',
  // Calendar
  calendar_add: '📅',
  // Reminder
  reminder_add: '⏰',
  // Dashboard
  dashboard: '📊',
  kanban: '📋',
  // Canvas
  canvas: '🎨',
  // Plugin
  plugin: '🔌',
  // Soul
  soul: '💫',
  // Cron
  cron_create: '⏱️',
  // Thread
  thread_ownership: '🔗',
  // Audio understanding
  audio_understanding: '🎵',
  // Code execution
  code_execution: '⚡',
  // Cross-session
  cross_session_memory: '🔗',
  // v5.10.0: New tools
  url_safety: '🛡️', approval: '✅', checkpoint: '💾', file_state: '🔍',
  pii_redact: '🔒', clarify: '❓', session_search: '🔎', x_search: '🐦',
  discord: '💬', send_message: '📨', async_delegation: '⏳', blueprint: '📐',
  spotify: '🎧', homeassistant: '🏠', microsoft_graph: '📊',   computer_use: '🖱️', computer_use_loop: '🔄',
  google_meet: '📹',
  // Orchestrator
  workflow: '⚙️',
  social_open: '🔗', youtube_ac: '🎬', memory_provider: '🗄️',
};

// ── Toolset grouping ─────────────────────────────────────────────────────
const TOOLSET_MAP = {
  // File
  read_file: 'file', write_file: 'file', edit_file: 'file', list_dir: 'file',
  file_search: 'file', grep_search: 'file', filesystem: 'file',
  // Terminal
  bash: 'terminal', shell_command: 'terminal',
  // Web
  duckduckgo: 'web', web_search: 'web', web_readability: 'web', firecrawl: 'web',
  searxng: 'web', http_request: 'web', http: 'web', exa_search: 'web',
  parallel_search: 'web',
  duckduckgo_search: 'web', searxng_search: 'web',
  // Browser
  browser: 'browser', browser_use: 'browser',
  // Memory
  memory: 'memory', memory_write: 'memory', memory_search: 'memory',
  // Skills
  skill_view: 'skills', skills_list: 'skills', skill_generate: 'skills',
  skills_autoload: 'skills', skills_marketplace: 'skills', skill_manage: 'skills',
  // Agent
  delegate_task: 'agent', llm_task: 'agent',
  // Documents
  document_extract: 'documents', notebook_edit: 'documents', notes_add: 'documents',
  // Git
  git: 'git',
  // Plan / Todo
  plan: 'planning', todo_write: 'planning',
  // Media
  image_generation: 'media', video_generation: 'media', music_generation: 'media',
  media_understanding: 'media', text_to_speech: 'media', speech_to_text: 'media',
  voice_chat: 'media', audio_understanding: 'media',
  // macOS
  mac_alarm: 'macos', mac_app_open: 'macos', mac_app_quit: 'macos', mac_notify: 'macos',
  macos_screenshot: 'macos', phone_control: 'macos', phone_control_enhanced: 'macos',
  // Calendar
  calendar_add: 'calendar',
  // Reminder
  reminder_add: 'reminders',
  // Other
  dashboard: 'dashboard', canvas: 'canvas', plugin: 'plugins', soul: 'soul',
  kanban: 'planning',
  cron_create: 'cron', thread_ownership: 'threads', code_execution: 'sandbox',
  cross_session_memory: 'memory',
  // v5.10.0: New tools
  url_safety: 'security', approval: 'security', pii_redact: 'security',
  checkpoint: 'system', file_state: 'system',
  clarify: 'agent',
  session_search: 'memory',
  x_search: 'web', discord: 'communication', send_message: 'communication',
  async_delegation: 'agent', blueprint: 'planning', workflow: 'orchestrator',
  spotify: 'media', homeassistant: 'iot', microsoft_graph: 'office',
  computer_use: 'automation', computer_use_loop: 'automation', google_meet: 'communication',
  social_open: 'communication', youtube_ac: 'media',
  sub_agent: 'agent', memory_provider: 'memory',
};

// ── check_fn'ler (tool availability kontrolleri) ────────────────────────
function _checkBrowser() {
  try {
    require.resolve('playwright');
    return true;
  } catch { return false; }
}

function _checkDuckDuckGo() {
  return true; // API-based, always available
}

function _checkMacOSTools() {
  return process.platform === 'darwin';
}

const CHECK_FN_MAP = {
  browser: _checkBrowser,
  mac_alarm: _checkMacOSTools,
  mac_app_open: _checkMacOSTools,
  mac_app_quit: _checkMacOSTools,
  mac_notify: _checkMacOSTools,
  macos_screenshot: _checkMacOSTools,
  phone_control: _checkMacOSTools,
  phone_control_enhanced: _checkMacOSTools,
  // v5.10.0: google_meet create macOS-only; computer_use partial cross-platform
  google_meet: () => process.platform === 'darwin' || true, // only 'create' is macOS-only, 'open' cross-platform
};

// ── Provider filtering ───────────────────────────────────────────────────
function getToolsForProvider(allTools, providerUrl) {
  const url = (providerUrl || '').toLowerCase();
  if (url.includes('groq.com')) {
    const allowed = ['read_file', 'write_file', 'bash', 'shell_command', 'list_dir', 'soul', 'memory', 'memory_write', 'memory_search', 'filesystem', 'grep_search'];
    return allTools.filter(t => allowed.includes(t.name));
  }
  return allTools;
}

function loadToolDefinitions() {
  const tools = [];
  const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.js'));

  let isGroq = false;
  try {
    const { getConfig } = require('./config');
    const cfg = getConfig();
    if (cfg.providerUrl && cfg.providerUrl.toLowerCase().includes('groq.com')) {
      isGroq = true;
    }
  } catch (e) {}

  let disabledTools = new Set();
  try {
    const { getConfig } = require('./config');
    const cfg = getConfig();
    if (Array.isArray(cfg.disabledTools)) disabledTools = new Set(cfg.disabledTools);
  } catch (e) {}

  const GROQ_ALLOWED = new Set([
    'read_file', 'write_file', 'list_dir', 'bash', 'shell_command',
    'soul', 'memory', 'memory_write', 'memory_search', 'filesystem', 'grep_search'
  ]);

  for (const file of files) {
    try {
      const toolPath = path.join(TOOLS_DIR, file);
      const mod = require(toolPath);
      const toolName = mod.name || path.basename(file, '.js');

      if (isGroq && !GROQ_ALLOWED.has(toolName)) continue;
      if (disabledTools.has(toolName)) continue;

      const meta = {
        name: toolName,
        description: mod.description || `${path.basename(file, '.js')} tool`,
        parameters: mod.parameters || mod.inputSchema || { type: 'object', properties: {} },
        execute: mod.execute || (mod.default && mod.default.execute) || null,
        emoji: EMOJI_MAP[toolName] || '',
        toolset: TOOLSET_MAP[toolName] || 'general',
        checkFn: CHECK_FN_MAP[toolName] || null,
      };

      if (meta.execute) {
        tools.push(meta);
        // Registry'ye kaydet
        globalRegistry.register({
          name: meta.name,
          toolset: meta.toolset,
          schema: { name: meta.name, description: meta.description, parameters: meta.parameters },
          handler: meta.execute,
          checkFn: meta.checkFn,
          emoji: meta.emoji,
        });
      }
    } catch (e) {
      // Sessizce atla
    }
  }
  return tools;
}

const ALIAS_MAP = {
  'brave_search': 'duckduckgo_search', 'brave-web-search': 'duckduckgo_search',
  'google_search': 'duckduckgo_search', 'web_search': 'duckduckgo_search',
  'browse': 'browser', 'shell': 'bash', 'bash_command': 'bash',
  'execute_command': 'bash', 'run_command': 'bash',
  'http': 'http_request',
};

const BLOCKED_NAMES = new Set([
  'brave_search', 'brave-web-search', 'google_search', 'web_search',
  'browse', 'open', 'search', 'shell', 'bash_command', 'execute_command',
  'run_command', 'sql', 'query', 'lookup', 'http',
]);

// ── check_fn TTL cache (Hermes-style, ~30s) ────────────────────────────
const _checkFnCache = new Map();
function _cachedCheckFn(fn, key) {
  const now = Date.now();
  const cached = _checkFnCache.get(key);
  if (cached && now - cached.ts < 30000) return cached.result;
  let result = true;
  try { result = fn() !== false; } catch { result = false; }
  _checkFnCache.set(key, { result, ts: now });
  return result;
}

function toOpenAIFormat(toolDefs) {
  return toolDefs
    .filter(t => !BLOCKED_NAMES.has(t.name))
    .filter(t => {
      if (t.checkFn) {
        return _cachedCheckFn(t.checkFn, t.name);
      }
      return true;
    })
    .map(t => {
      let name = t.name;
      if (ALIAS_MAP[name]) name = ALIAS_MAP[name];

      const cleanParams = JSON.parse(JSON.stringify(t.parameters || {}));
      if (cleanParams.properties) {
        Object.keys(cleanParams.properties).forEach(key => {
          const prop = cleanParams.properties[key];
          if (Array.isArray(prop.type)) prop.type = prop.type[0];
          delete prop.additionalProperties;
        });
      }

      return {
        type: 'function',
        function: { name, description: t.description, parameters: cleanParams },
      };
    });
}

async function executeTool(toolName, args, toolDefs) {
  const tool = toolDefs.find(t => t.name === toolName);
  if (!tool) return { error: `Tool bulunamadı: ${toolName}` };
  if (!tool.execute) return { error: `Tool execute fonksiyonu yok: ${toolName}` };
  // checkFn — tool disabled? (re-check at runtime with cache)
  if (tool.checkFn) {
    if (!_cachedCheckFn(tool.checkFn, tool.name)) {
      return { error: `${toolName} şu anda kullanılamıyor (check_fn engelledi)` };
    }
  }
  try {
    const result = await tool.execute(args || {});
    return { result };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

module.exports = {
  loadToolDefinitions, toOpenAIFormat, executeTool, getToolsForProvider,
  EMOJI_MAP, TOOLSET_MAP, CHECK_FN_MAP,
};
