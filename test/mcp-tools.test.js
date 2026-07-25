import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { loadMcpToolDefinitions, qualifiedName, isConfigured, toParameters } = requireCjs('../src/utils/mcp-tools.js');

function fakeApi(tools, overrides = {}) {
  return {
    startMcpServers: vi.fn(async () => {}),
    getMcpTools: vi.fn(() => tools),
    executeMcpTool: vi.fn(async () => ({ success: true, output: 'mcp says hi' })),
    ...overrides,
  };
}

const config = { mcpServers: { github: { command: 'npx' } } };

describe('qualifiedName', () => {
  it('namespaces on the server so an MCP tool cannot shadow a built-in', () => {
    expect(qualifiedName('github', 'read_file')).toBe('mcp__github__read_file');
  });

  it('strips characters providers reject in a function name', () => {
    expect(qualifiedName('my server.v2', 'do/thing')).toBe('mcp__my_server_v2__do_thing');
  });

  it('stays within the 64-character provider limit', () => {
    expect(qualifiedName('s'.repeat(60), 't'.repeat(60)).length).toBeLessThanOrEqual(64);
  });
});

describe('isConfigured', () => {
  it('is false with no servers, when disabled globally, or when every server is disabled', () => {
    expect(isConfigured({})).toBe(false);
    expect(isConfigured({ mcpEnabled: false, mcpServers: { a: { command: 'x' } } })).toBe(false);
    expect(isConfigured({ mcpServers: { a: { command: 'x', disabled: true } } })).toBe(false);
  });

  it('is true for at least one enabled server', () => {
    expect(isConfigured({ mcpServers: { a: { command: 'x' } } })).toBe(true);
  });
});

describe('toParameters', () => {
  it('passes an object schema through untouched', () => {
    const schema = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] };
    expect(toParameters({ inputSchema: schema })).toBe(schema);
  });

  it('produces a valid empty object schema when the server sends none', () => {
    expect(toParameters({})).toEqual({ type: 'object', properties: {}, required: [] });
  });
});

describe('loadMcpToolDefinitions', () => {
  it('starts nothing when no server is configured', async () => {
    const api = fakeApi([]);
    const result = await loadMcpToolDefinitions({ api, config: {} });
    expect(api.startMcpServers).not.toHaveBeenCalled();
    expect(result.tools).toEqual([]);
  });

  it('adapts server tools into executable tool definitions', async () => {
    const api = fakeApi([
      { name: 'search', description: 'Search repos', inputSchema: { type: 'object', properties: { q: { type: 'string' } } }, _mcpServer: 'github' },
    ]);
    const result = await loadMcpToolDefinitions({ api, config });

    expect(result.servers).toEqual(['github']);
    expect(result.tools).toHaveLength(1);
    const [tool] = result.tools;
    expect(tool.name).toBe('mcp__github__search');
    expect(tool.description).toContain('[MCP:github]');
    expect(tool.parameters.properties.q.type).toBe('string');

    await expect(tool.execute({ q: 'x' })).resolves.toBe('mcp says hi');
    // The server is called with its own unqualified name, not our namespaced one.
    expect(api.executeMcpTool).toHaveBeenCalledWith('search', { q: 'x' });
  });

  it('surfaces a tool failure as a thrown error so the agent reports it', async () => {
    const api = fakeApi(
      [{ name: 'broken', _mcpServer: 'srv' }],
      { executeMcpTool: vi.fn(async () => ({ success: false, error: 'upstream exploded' })) },
    );
    const { tools } = await loadMcpToolDefinitions({ api, config });
    await expect(tools[0].execute({})).rejects.toThrow('upstream exploded');
  });

  it('reports a failing server instead of preventing the agent from starting', async () => {
    const api = fakeApi([], { startMcpServers: vi.fn(async () => { throw new Error('spawn ENOENT'); }) });
    const result = await loadMcpToolDefinitions({ api, config });
    expect(result.tools).toEqual([]);
    expect(result.errors).toEqual(['spawn ENOENT']);
  });
});
