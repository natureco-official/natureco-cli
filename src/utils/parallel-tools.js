// Parallel Tool Runner — run multiple independent tool/MCP calls in parallel

async function executeSingle(tool, options = {}) {
  const { type, name, params } = tool;
  const executeTool = options.executeTool || defaultExecuteTool;

  if (type === 'mcp') {
    return executeMcpCall(tool, options);
  }
  if (type === 'function') {
    return executeTool(name, params);
  }
  throw new Error(`Unknown tool type: ${type}`);
}

async function defaultExecuteTool(toolName, params) {
  const { executeTool } = require('./tool-runner');
  return executeTool(toolName, params);
}

async function executeMcpCall(tool, options = {}) {
  const { name, params } = tool;
  const getClient = options.getMcpClient;

  if (!getClient) {
    return { success: false, error: 'No MCP client lookup provided (options.getMcpClient)' };
  }

  const client = getClient(name);
  if (!client) {
    return { success: false, error: `MCP client not found for tool: ${name}` };
  }

  try {
    const result = await client.callTool(name, params);
    if (result.content && result.content.length > 0) {
      const textContents = result.content
        .filter(c => c.type === 'text')
        .map(c => c.text);
      if (textContents.length > 0) {
        return { success: true, output: textContents.join('\n') };
      }
    }
    return { success: true, output: JSON.stringify(result, null, 2) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Run multiple independent tool calls in parallel
// tools: [{ name, params, type: 'mcp' | 'function' }]
async function runParallel(tools, options = {}) {
  if (!tools || tools.length === 0) return [];

  const results = await Promise.allSettled(
    tools.map(t => executeSingle(t, options))
  );

  return results.map((r, i) => ({
    tool: tools[i].name,
    status: r.status === 'fulfilled' ? 'success' : 'error',
    result: r.status === 'fulfilled' ? r.value : r.reason.message,
  }));
}

// Group tool calls by independence
// dependencyMap: { inputKeys?: string[], outputKeys?: string[] }
// Tools that don't share input/output keys are independent
function groupIndependent(tools, dependencyMap = {}) {
  if (!tools || tools.length === 0) return [];

  const maps = tools.map(t => ({
    tool: t,
    inputs: dependencyMap[t.name]?.inputKeys || Object.keys(t.params || {}),
    outputs: dependencyMap[t.name]?.outputKeys || [],
  }));

  const groups = [];

  for (const item of maps) {
    const allKeys = [...item.inputs, ...item.outputs];
    let placed = false;

    for (const group of groups) {
      const overlap = allKeys.some(k => group.keys.includes(k));
      if (!overlap) {
        group.items.push(item.tool);
        group.keys.push(...allKeys);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push({ items: [item.tool], keys: allKeys });
    }
  }

  return groups.map(g => g.items);
}

module.exports = {
  executeSingle,
  runParallel,
  groupIndependent,
};
