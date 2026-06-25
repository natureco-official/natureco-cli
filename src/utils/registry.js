/**
 * registry — Hermes-style tool registry
 *
 * Each tool registers itself with:
 *   - name: unique tool name
 *   - toolset: group name (e.g. "file", "web", "terminal", "skills", "memory")
 *   - schema: OpenAI function-calling schema
 *   - handler: async function(args) => string (JSON)
 *   - checkFn: optional function() => bool (is tool available?)
 *   - requiresEnv: optional [envVarNames]
 *   - emoji: optional display emoji
 */

class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register({ name, toolset, schema, handler, checkFn, requiresEnv, emoji }) {
    if (this._tools.has(name)) {
      return;
    }
    this._tools.set(name, { name, toolset, schema, handler, checkFn: checkFn || null, requiresEnv: requiresEnv || [], emoji: emoji || '' });
  }

  get(name) {
    return this._tools.get(name) || null;
  }

  getAll() {
    return Array.from(this._tools.values());
  }

  getByToolset(toolset) {
    return this.getAll().filter(t => t.toolset === toolset);
  }

  getToolsets() {
    const sets = new Set();
    for (const t of this._tools.values()) {
      sets.add(t.toolset);
    }
    return Array.from(sets).sort();
  }

  getDefinitions({ filterUnavailable } = {}) {
    const result = [];
    for (const entry of this._tools.values()) {
      if (filterUnavailable && entry.checkFn) {
        try {
          if (!entry.checkFn()) continue;
        } catch {
          continue;
        }
      }
      result.push({
        type: 'function',
        function: {
          name: entry.name,
          description: entry.schema.description || entry.schema.name || '',
          parameters: entry.schema.parameters || { type: 'object', properties: {} },
        },
      });
    }
    return result;
  }

  async dispatch(name, args) {
    const entry = this._tools.get(name);
    if (!entry) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    try {
      return await entry.handler(args);
    } catch (e) {
      return JSON.stringify({ error: `${e.message || e}` });
    }
  }

  getSchema(name) {
    const entry = this._tools.get(name);
    return entry ? entry.schema : null;
  }

  getEmoji(name, fallback = '') {
    const entry = this._tools.get(name);
    return entry ? (entry.emoji || fallback) : fallback;
  }
}

const globalRegistry = new ToolRegistry();

module.exports = { ToolRegistry, globalRegistry };
