/**
 * memory — Unified memory tool (Hermes-style)
 *
 * Single tool with action=add|remove|replace|list, target=memory|user
 *
 * Coexists with existing memory_write / memory_search tools.
 * New system prompt uses memory-store snapshot; this tool mutates live state.
 */

const { getMemoryStore } = require('../utils/memory-store');

const name = 'memory';
const description = 'Persistent memory across sessions. Use action=add to save facts, action=list to see everything, action=remove to delete by substring match. target=memory for environment facts, target=user for user preferences and traits.';
const parameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'remove', 'replace', 'list'],
      description: 'Operation: add (append entry), remove (by substring match), replace (find by substring, replace), list (show all)',
    },
    target: {
      type: 'string',
      enum: ['memory', 'user'],
      description: 'Which store: memory (agent notes) or user (user preferences/habits)',
    },
    content: {
      type: 'string',
      description: 'Content to add/remove/replace. For replace, this is the new content.',
    },
    oldContent: {
      type: 'string',
      description: 'For replace: substring to match existing entry.',
    },
  },
  required: ['action', 'target'],
};

async function execute(args) {
  const store = getMemoryStore();
  const { action, target = 'memory', content, oldContent } = args;

  switch (action) {
    case 'add':
      if (!content) return JSON.stringify({ success: false, error: 'content required for add' });
      return store.add(target, content);
    case 'remove':
      if (!content) return JSON.stringify({ success: false, error: 'content required for remove' });
      return store.remove(target, content);
    case 'replace':
      if (!content || !oldContent) return JSON.stringify({ success: false, error: 'content and oldContent required for replace' });
      return store.replace(target, oldContent, content);
    case 'list':
      return store.list(target);
    default:
      return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
  }
}

module.exports = { name, description, parameters, execute };
