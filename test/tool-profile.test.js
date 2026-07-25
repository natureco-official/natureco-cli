import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { selectTools, buildCatalog, createEnableToolsTool, isPlatformDead, CORE_TOOLS } =
  requireCjs('../src/utils/tool-profile.js');
const { loadToolDefinitions, toOpenAIFormat } = requireCjs('../src/utils/tools.js');
const { supportsNativeToolCalls } = requireCjs('../src/utils/provider-detect.js');

const tokens = value => Math.ceil(JSON.stringify(value).length / 4);

/**
 * Every request serialized the whole manifest as JSON Schema — 83 tools, ~13.8k
 * tokens — against a default 16k context budget. The schemas alone consumed
 * most of the window before a single message was written.
 */
describe('tool profiles cut the per-request payload', () => {
  const defs = loadToolDefinitions();

  it('core exposes far fewer schemas than all', () => {
    const all = selectTools(defs, { profile: 'all' });
    const core = selectTools(defs, { profile: 'core' });
    expect(core.exposed.length).toBeLessThan(all.exposed.length / 2);
    expect(core.hidden.length).toBeGreaterThan(0);
  });

  it('saves more than half the tokens even counting the catalogue', () => {
    const all = tokens(toOpenAIFormat(selectTools(defs, { profile: 'all' }).exposed));
    const core = selectTools(defs, { profile: 'core' });
    const withCatalog = tokens(toOpenAIFormat(core.exposed)) + Math.ceil(buildCatalog(core.hidden).length / 4);
    expect(withCatalog).toBeLessThan(all * 0.5);
  });

  it('keeps the tools a coding turn actually needs', () => {
    const exposed = new Set(selectTools(defs, { profile: 'core' }).exposed.map(t => t.name));
    for (const name of ['read_file', 'write_file', 'edit_file', 'bash', 'grep_search', 'file_search']) {
      expect(exposed.has(name), `${name} must stay in the core set`).toBe(true);
    }
  });

  it('always advertises MCP tools — the user configured that server deliberately', () => {
    const withMcp = [...defs, { name: 'mcp__github__search', description: 'x', parameters: {}, _mcp: { server: 'github' } }];
    const exposed = selectTools(withMcp, { profile: 'core' }).exposed.map(t => t.name);
    expect(exposed).toContain('mcp__github__search');
  });

  it('drops platform-dead tools even in the all profile', () => {
    const all = selectTools(defs, { profile: 'all', platform: 'win32' }).exposed.map(t => t.name);
    expect(all).not.toContain('mac_app_open');
    expect(isPlatformDead('mac_app_open', 'win32')).toBe(true);
    expect(isPlatformDead('mac_app_open', 'darwin')).toBe(false);
  });
});

describe('catalogue + enable_tools keep every tool reachable', () => {
  it('names every hidden tool so the model knows it exists', () => {
    const defs = loadToolDefinitions();
    const { hidden } = selectTools(defs, { profile: 'core' });
    const catalog = buildCatalog(hidden);
    for (const tool of hidden.slice(0, 10)) {
      expect(catalog).toContain(tool.name);
    }
  });

  it('costs a fraction of a schema per tool', () => {
    const defs = loadToolDefinitions();
    const { hidden } = selectTools(defs, { profile: 'core' });
    const perTool = Math.ceil(buildCatalog(hidden).length / 4) / hidden.length;
    expect(perTool).toBeLessThan(20);
  });

  it('enable_tools moves a catalogued tool into the exposed set', async () => {
    const defs = loadToolDefinitions();
    const enabled = new Set();
    const enableTool = createEnableToolsTool(enabled, () => defs.map(t => t.name));
    const hiddenName = selectTools(defs, { profile: 'core' }).hidden[0].name;

    expect(selectTools(defs, { profile: 'core', enabled }).exposed.map(t => t.name)).not.toContain(hiddenName);
    const result = await enableTool.execute({ names: [hiddenName] });
    expect(result.enabled).toContain(hiddenName);
    expect(selectTools(defs, { profile: 'core', enabled }).exposed.map(t => t.name)).toContain(hiddenName);
  });

  it('reports unknown names instead of silently enabling nothing', async () => {
    const enabled = new Set();
    const enableTool = createEnableToolsTool(enabled, () => ['read_file']);
    const result = await enableTool.execute({ names: ['no_such_tool'] });
    expect(result.unknown).toContain('no_such_tool');
    expect(result.enabled).toEqual([]);
  });
});

/**
 * The capability check blanket-excluded MiniMax, which forced every MiniMax
 * user through the workflow tool's XML runner — an extra classify/plan round
 * trip per message. M2.5 emits well-formed tool_calls.
 */
describe('supportsNativeToolCalls is model-aware', () => {
  it('accepts MiniMax M2.5 and above', () => {
    expect(supportsNativeToolCalls('https://api.minimax.io', 'MiniMax-M2.5')).toBe(true);
    expect(supportsNativeToolCalls('https://api.minimax.io', 'MiniMax-M3')).toBe(true);
  });

  it('still routes older MiniMax models through the XML runner', () => {
    expect(supportsNativeToolCalls('https://api.minimax.io', 'MiniMax-M2.1')).toBe(false);
    expect(supportsNativeToolCalls('https://api.minimax.io', 'abab6')).toBe(false);
  });

  it('keeps the known-unreliable providers excluded', () => {
    expect(supportsNativeToolCalls('https://generativelanguage.googleapis.com', 'gemini-2.5-pro')).toBe(false);
    expect(supportsNativeToolCalls('http://localhost:11434', 'llama3')).toBe(false);
    expect(supportsNativeToolCalls('https://api.groq.com', 'llama-3.3')).toBe(false);
  });

  it('accepts mainstream tool-calling providers', () => {
    expect(supportsNativeToolCalls('https://api.openai.com/v1', 'gpt-4o')).toBe(true);
    expect(supportsNativeToolCalls('https://api.anthropic.com', 'claude-opus-5')).toBe(true);
  });

  it('honours an explicit config override in both directions', () => {
    expect(supportsNativeToolCalls('https://api.openai.com', 'gpt-4o', { nativeToolCalls: false })).toBe(false);
    expect(supportsNativeToolCalls('http://localhost:11434', 'llama3', { nativeToolCalls: true })).toBe(true);
  });
});

describe('CORE_TOOLS is a deliberate list, not everything', () => {
  it('stays small enough to matter', () => {
    expect(CORE_TOOLS.size).toBeLessThan(30);
  });
});
