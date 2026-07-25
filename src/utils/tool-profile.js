/**
 * Tool exposure profiles — send the model the tools it needs, not all of them.
 *
 * Every request carried the full manifest as JSON Schema: 83 tools, ~13.8k
 * tokens, on a default context budget of 16k. The schemas alone consumed ~84%
 * of the window before a single message was written, on every turn, whether the
 * turn used two tools or none.
 *
 * The fix is not to remove tools. Execution still resolves against the complete
 * set, so nothing is lost: a core set is advertised up front, the rest appear
 * as a one-line name catalogue (~3 tokens each), and the model pulls in the
 * full schema for anything it needs with `enable_tools`.
 *
 * Set `toolProfile: "all"` in config (or pass `--all-tools`) for the old
 * send-everything behaviour.
 */

const { getLang } = require('./i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

/**
 * Advertised on every request. These are the tools a coding turn reaches for
 * constantly; anything rarer costs a round trip to enable, which is far cheaper
 * than paying for its schema on every request forever.
 */
const CORE_TOOLS = new Set([
  // Files
  'read_file', 'write_file', 'edit_file', 'structural_patch', 'notebook_edit',
  'list_dir', 'file_search', 'grep_search',
  // Execution
  'bash', 'shell_command', 'code_execution', 'git',
  // Task shape
  'todo_write', 'plan', 'clarify', 'sub_agent',
  // Knowledge
  'web_search', 'web_readability', 'skill_find', 'skill_view',
  'memory_search', 'memory_write',
]);

/**
 * Tools whose platform requirement is not met. `checkFn` filtering catches most
 * of them, but a handful advertise themselves everywhere and are dead weight
 * off their platform.
 */
const MAC_ONLY = new Set([
  'mac_alarm', 'mac_app_open', 'mac_app_quit', 'mac_notify', 'macos_screenshot',
  'notes_add', 'reminder_add', 'calendar_add', 'social_open', 'spotify',
  'voice_chat', 'youtube_ac', 'google_meet',
]);

function isPlatformDead(name, platform = process.platform) {
  return platform !== 'darwin' && MAC_ONLY.has(name);
}

/**
 * Decide which tool definitions are advertised to the model this request.
 *
 * @param {Array} toolDefs        every known tool (execution still uses all of them)
 * @param {object} options
 * @param {'core'|'all'} [options.profile]
 * @param {Set<string>} [options.enabled]  names enabled during this session
 * @param {string} [options.platform]
 * @returns {{ exposed: Array, hidden: Array }}
 */
function selectTools(toolDefs, options = {}) {
  const profile = options.profile || 'core';
  const enabled = options.enabled || new Set();
  const platform = options.platform || process.platform;

  const alive = toolDefs.filter(tool => !isPlatformDead(tool.name, platform));

  if (profile === 'all') return { exposed: alive, hidden: [] };

  const exposed = [];
  const hidden = [];
  for (const tool of alive) {
    // MCP tools are advertised: the user configured that server deliberately,
    // and there is no catalogue entry that would let the model guess its shape.
    const isMcp = Boolean(tool._mcp) || tool.name.startsWith('mcp__');
    if (CORE_TOOLS.has(tool.name) || enabled.has(tool.name) || isMcp || tool._alwaysExpose) {
      exposed.push(tool);
    } else {
      hidden.push(tool);
    }
  }
  return { exposed, hidden };
}

/**
 * Names of the tools that exist but are not currently loaded.
 *
 * Names only, deliberately. The first version appended a 60-character summary
 * per tool, which came to 955 tokens against a 681-token system prompt — the
 * persona was outweighed 58/42 by a list of tool names, and the assistant
 * started answering like a terse tool dispatcher instead of itself. A bare name
 * is enough for the model to ask for the schema.
 */
function buildCatalogNames(hidden) {
  return hidden.map(tool => tool.name).sort();
}

/**
 * The one line that goes in the system prompt. Everything else about the
 * catalogue lives on the `enable_tools` description, so persona text is not
 * competing with an inventory.
 */
function buildCatalog(hidden) {
  if (!hidden.length) return '';
  return L(
    `Yüklü olmayan ${hidden.length} araç daha var; gerekirse enable_tools ile şemasını yükle.`,
    `${hidden.length} more tools exist but are not loaded; call enable_tools to load a schema when you need one.`,
  );
}

/**
 * The virtual tool that lets the model pull hidden schemas in for the rest of
 * the session.
 */
function createEnableToolsTool(enabled, resolveNames, resolveCatalogNames) {
  // The inventory lives here rather than in the system prompt: it is reference
  // data for this one tool, and keeping it out of the prompt leaves the persona
  // and behaviour instructions dominant.
  const catalogue = typeof resolveCatalogNames === 'function' ? resolveCatalogNames() : [];
  const available = catalogue.length ? ` Available: ${catalogue.join(', ')}.` : '';
  return {
    name: 'enable_tools',
    _alwaysExpose: true,
    description:
      'Load the full schemas for additional tools so they can be called. ' +
      'Call this once with every tool you expect to need, then call those tools normally on the next step.' +
      available,
    parameters: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tool names from the catalogue, e.g. ["image_generation","discord"]',
        },
      },
      required: ['names'],
    },
    execute: async (args) => {
      const requested = Array.isArray(args?.names) ? args.names : [];
      const known = new Set(resolveNames());
      const added = [];
      const unknown = [];
      for (const raw of requested) {
        const name = String(raw || '').trim();
        if (!name) continue;
        if (!known.has(name)) { unknown.push(name); continue; }
        enabled.add(name);
        added.push(name);
      }
      return {
        enabled: added,
        unknown,
        note: added.length
          ? 'Schemas are loaded. Call these tools on your next step.'
          : 'Nothing was enabled.',
      };
    },
  };
}

module.exports = {
  CORE_TOOLS,
  MAC_ONLY,
  isPlatformDead,
  selectTools,
  buildCatalog,
  buildCatalogNames,
  createEnableToolsTool,
};
