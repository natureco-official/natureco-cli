/**
 * MCP tools as native tool definitions.
 *
 * MCP servers were only reachable from the chat/repl path (api.js wires them
 * into its own loop). The coding agent builds its tool list from
 * loadToolDefinitions(), which is the built-in manifest only, so a configured
 * MCP server was invisible to `natureco code` — the one mode where it matters
 * most. This adapter turns each server's tools into the same
 * `{ name, description, parameters, execute }` shape the manifest produces, so
 * they flow through the normal execution gateway (guardrails, permissions,
 * redaction, tool cards) with no special-casing at the call site.
 */

const { getConfig } = require('./config');
const { getLang } = require('./i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

/**
 * Provider function names are constrained (OpenAI: /^[a-zA-Z0-9_-]{1,64}$/), and
 * a server is free to expose a tool called `read_file` that would otherwise
 * shadow the built-in one. Namespace on the server, like other MCP hosts do.
 */
function qualifiedName(serverName, toolName) {
  const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `mcp__${safe(serverName)}__${safe(toolName)}`.slice(0, 64);
}

function toParameters(tool) {
  const schema = tool.inputSchema || tool.input_schema || {};
  if (schema.type !== 'object' || !schema.properties) {
    return { type: 'object', properties: schema.properties || {}, required: schema.required || [] };
  }
  return schema;
}

function isConfigured(config = getConfig()) {
  if (config.mcpEnabled === false) return false;
  const servers = config.mcpServers || {};
  return Object.values(servers).some(server => server && !server.disabled);
}

/**
 * Start configured MCP servers and return their tools as tool definitions.
 * Never throws: a broken server must not stop the agent from starting, so
 * failures come back in `errors` for the caller to surface.
 */
async function loadMcpToolDefinitions(deps = {}) {
  const api = deps.api || require('./api');
  const config = deps.config || getConfig();
  const result = { tools: [], servers: [], errors: [] };

  if (!isConfigured(config)) return result;

  try {
    await api.startMcpServers();
  } catch (error) {
    result.errors.push(error.message);
    return result;
  }

  let discovered;
  try {
    discovered = api.getMcpTools() || [];
  } catch (error) {
    result.errors.push(error.message);
    return result;
  }

  const servers = new Set();
  for (const tool of discovered) {
    const serverName = tool._mcpServer || 'mcp';
    servers.add(serverName);
    const rawName = tool.name;
    result.tools.push({
      name: qualifiedName(serverName, rawName),
      description: `[MCP:${serverName}] ${tool.description || rawName}`,
      parameters: toParameters(tool),
      _mcp: { server: serverName, rawName },
      execute: async (args) => {
        const outcome = await api.executeMcpTool(rawName, args || {});
        if (outcome && outcome.success === false) {
          throw new Error(outcome.error || L('MCP aracı başarısız oldu', 'MCP tool failed'));
        }
        return outcome?.output ?? outcome;
      },
    });
  }

  result.servers = Array.from(servers);
  return result;
}

module.exports = { loadMcpToolDefinitions, qualifiedName, isConfigured, toParameters };
