import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDirs = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

function isolatedHome(prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(home);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  for (const id of Object.keys(require.cache)) {
    if (id.includes(`${path.sep}src${path.sep}`)) delete require.cache[id];
  }
  vi.resetModules();
  return home;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('previously uncovered persistent mutation tools', () => {
  it('blueprint persists, renders, lists, and deletes a reusable workflow', async () => {
    const home = isolatedHome('natureco-blueprint-');
    const tool = require('../../src/tools/blueprint');

    expect(await tool.execute({ action: 'create', name: 'release/plan' })).toMatchObject({ success: false });
    const created = await tool.execute({
      action: 'create', name: 'release/plan', description: 'release proof', steps: ['Deploy {{ app }}', { content: 'Check {{ app }}' }],
    });
    expect(created).toMatchObject({ success: true, stepCount: 2 });
    expect(fs.existsSync(path.join(home, '.natureco', 'blueprints', 'release_plan.json'))).toBe(true);
    expect(await tool.execute({ action: 'execute', name: 'release/plan', data: { app: 'NatureCo' } })).toMatchObject({
      success: true, steps: ['Deploy NatureCo', 'Check NatureCo'],
    });
    expect(await tool.execute({ action: 'list' })).toMatchObject({ blueprints: [expect.objectContaining({ name: 'release/plan', stepCount: 2 })] });
    expect((await tool.execute({ action: 'delete', name: 'release/plan' })).success).toBe(true);
    expect(await tool.execute({ action: 'load', name: 'release/plan' })).toMatchObject({ success: false });
  });

  it('checkpoint round-trips structured state and reports a missing deletion', async () => {
    const home = isolatedHome('natureco-checkpoint-');
    const tool = require('../../src/tools/checkpoint');

    expect(await tool.execute({ action: 'save' })).toMatchObject({ success: false });
    expect((await tool.execute({ action: 'save', name: 'phase/one', data: { step: 3, ready: true } })).success).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(home, '.natureco', 'checkpoints', 'phase_one.json'), 'utf8')).data).toEqual({ step: 3, ready: true });
    expect(await tool.execute({ action: 'load', name: 'phase/one' })).toMatchObject({ success: true, data: { step: 3, ready: true } });
    expect(await tool.execute({ action: 'list' })).toMatchObject({ checkpoints: [expect.objectContaining({ name: 'phase/one', size: 2 })] });
    expect((await tool.execute({ action: 'delete', name: 'phase/one' })).success).toBe(true);
    expect(await tool.execute({ action: 'delete', name: 'phase/one' })).toMatchObject({ success: false });
  });

  it('kanban persists add/move/remove transitions and rejects an unknown card', async () => {
    const home = isolatedHome('natureco-kanban-');
    const tool = require('../../src/tools/kanban');

    expect(await tool.execute({ action: 'add' })).toMatchObject({ success: false, error: expect.stringMatching(/title/) });
    const added = await tool.execute({ action: 'add', title: 'Ship tests', priority: 'high' });
    expect(added).toMatchObject({ success: true, card: expect.objectContaining({ title: 'Ship tests', priority: 'high' }) });
    expect(await tool.execute({ action: 'move', id: added.card.id, column: 'done' })).toMatchObject({ success: true, from: 'todo', to: 'done' });
    const stored = JSON.parse(fs.readFileSync(path.join(home, '.natureco', 'kanban.json'), 'utf8'));
    expect(stored.columns.done[0].id).toBe(added.card.id);
    expect((await tool.execute({ action: 'remove', id: added.card.id })).success).toBe(true);
    expect(await tool.execute({ action: 'remove', id: added.card.id })).toMatchObject({ success: false });
  });

  it('notebook_edit performs real cell mutations and leaves invalid requests unchanged', async () => {
    const home = isolatedHome('natureco-notebook-');
    const notebook = path.join(home, 'proof.ipynb');
    fs.writeFileSync(notebook, JSON.stringify({ cells: [{ cell_type: 'markdown', source: ['before'], metadata: {} }], metadata: {}, nbformat: 4, nbformat_minor: 5 }));
    const tool = require('../../src/tools/notebook_edit');

    expect(await tool.execute({ operation: 'read' })).toMatchObject({ success: false, error: expect.stringMatching(/filePath/) });
    expect((await tool.execute({ filePath: notebook, operation: 'update', cellIndex: 0, newSource: '# After' })).success).toBe(true);
    expect((await tool.execute({ filePath: notebook, operation: 'add', newSource: 'print(42)' })).success).toBe(true);
    expect(await tool.execute({ filePath: notebook, operation: 'read' })).toMatchObject({ success: true, cells: 2 });
    expect((await tool.execute({ filePath: notebook, operation: 'delete', cellIndex: 0 })).success).toBe(true);
    const saved = JSON.parse(fs.readFileSync(notebook, 'utf8'));
    expect(saved.cells).toHaveLength(1);
    expect(saved.cells[0]).toMatchObject({ cell_type: 'code', source: ['print(42)'], outputs: [] });
    expect(await tool.execute({ filePath: notebook, operation: 'delete', cellIndex: 9 })).toMatchObject({ success: false });
  });

  it('skill_manage creates, patches, and deletes an isolated skill with validation', async () => {
    const home = isolatedHome('natureco-skill-manage-');
    const tool = require('../../src/tools/skill_manage');
    const content = '---\nname: proof-skill\ndescription: proof\n---\n\nOriginal';

    expect(JSON.parse(await tool.execute({ action: 'create', name: 'proof-skill', content: 'no frontmatter' }))).toMatchObject({ success: false });
    expect(JSON.parse(await tool.execute({ action: 'create', name: 'proof-skill', content }))).toMatchObject({ success: true });
    const skillFile = path.join(home, '.natureco', 'skills', 'proof-skill', 'SKILL.md');
    expect(fs.readFileSync(skillFile, 'utf8')).toBe(content);
    expect(JSON.parse(await tool.execute({ action: 'patch', name: 'proof-skill', content: `${content}\nUpdated` }))).toMatchObject({ success: true });
    expect(fs.readFileSync(skillFile, 'utf8')).toContain('Updated');
    expect(JSON.parse(await tool.execute({ action: 'delete', name: 'proof-skill' }))).toMatchObject({ success: true });
    expect(JSON.parse(await tool.execute({ action: 'delete', name: 'proof-skill' }))).toMatchObject({ success: false });
  });

  it('skills_marketplace installs and uninstalls a built-in skill without network access', async () => {
    const home = isolatedHome('natureco-marketplace-');
    const tool = require('../../src/tools/skills_marketplace');

    expect(await tool.execute({ action: 'install' })).toMatchObject({ success: false, error: expect.stringMatching(/skillName/) });
    const installed = await tool.execute({ action: 'install', skillName: 'code-review' });
    expect(installed).toMatchObject({ success: true, skill: expect.objectContaining({ name: 'Code Review' }) });
    expect(fs.readFileSync(path.join(home, '.natureco', 'skills', 'code-review', 'SKILL.md'), 'utf8')).toContain('grep_search');
    expect((await tool.execute({ action: 'uninstall', skillName: 'code-review' })).success).toBe(true);
    expect(await tool.execute({ action: 'uninstall', skillName: 'code-review' })).toMatchObject({ success: false });
  });

  it('thread_ownership persists assignments and validates required identifiers', async () => {
    const home = isolatedHome('natureco-thread-owner-');
    const tool = require('../../src/tools/thread_ownership');

    expect(await tool.execute({ action: 'assign', threadId: 'room-7' })).toMatchObject({ success: false });
    expect(await tool.execute({ action: 'assign', threadId: 'room-7', agentName: 'security' })).toMatchObject({ success: true });
    expect(await tool.execute({ action: 'status', threadId: 'room-7' })).toMatchObject({ success: true, assignedAgent: 'security', isAssigned: true });
    expect(JSON.parse(fs.readFileSync(path.join(home, '.natureco', 'config.json'), 'utf8')).threadOwnership).toEqual({ 'room-7': 'security' });
    expect((await tool.execute({ action: 'release', threadId: 'room-7' })).success).toBe(true);
    expect(await tool.execute({ action: 'status', threadId: 'room-7' })).toMatchObject({ assignedAgent: null, isAssigned: false });
  });

  it('model_provider lists registered implementations and persists a switch', async () => {
    const home = isolatedHome('natureco-model-provider-');
    const tool = require('../../src/tools/model_provider');

    expect(await tool.execute({ action: 'switch' })).toMatchObject({ success: false });
    const listed = await tool.execute({ action: 'list' });
    expect(listed).toMatchObject({ success: true });
    expect(listed.providers.map(p => p.name)).toEqual(expect.arrayContaining(['openai', 'anthropic', 'gemini', 'minimax', 'ollama']));
    expect(await tool.execute({ action: 'switch', provider: 'ollama', model: 'qwen3' })).toMatchObject({ success: true });
    expect(JSON.parse(fs.readFileSync(path.join(home, '.natureco', 'config.json'), 'utf8'))).toMatchObject({ modelProvider: 'ollama', providerModel: 'qwen3' });
  });

  it('search_provider lists backends and persists selection without searching remotely', async () => {
    const home = isolatedHome('natureco-search-provider-');
    const tool = require('../../src/tools/search_provider');

    expect(await tool.execute({ action: 'search' })).toMatchObject({ success: false, error: expect.stringMatching(/query/) });
    const listed = await tool.execute({ action: 'list' });
    expect(listed.providers.map(p => p.name)).toEqual(expect.arrayContaining(['duckduckgo', 'exa', 'searxng', 'tavily']));
    expect(await tool.execute({ action: 'switch', provider: 'duckduckgo' })).toMatchObject({ success: true });
    expect(JSON.parse(fs.readFileSync(path.join(home, '.natureco', 'config.json'), 'utf8')).searchProvider).toBe('duckduckgo');
  });
});
