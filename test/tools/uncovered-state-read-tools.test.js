import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDirs = [];
const originalEnv = { ...process.env };

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
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('previously uncovered state and read tools', () => {
  it('canvas renders real table content and reports malformed parameters', async () => {
    const tool = require('../../src/tools/canvas');
    const result = await tool.execute({
      type: 'table',
      title: 'Build proof',
      headers: ['Target', 'State'],
      rows: [['tests', 'green']],
    });

    expect(result).toMatchObject({ success: true, type: 'table', rendered: true });
    expect(result.output).toContain('Build proof');
    expect(result.output).toContain('Target');
    expect(result.output).toContain('tests');
    expect(result.output).toContain('green');
    expect(await tool.execute(null)).toMatchObject({ success: false, error: expect.any(String) });
  });

  it('clarify returns a structured choice request and rejects a missing question', async () => {
    const tool = require('../../src/tools/clarify');
    expect(await tool.execute({
      question: 'Which environment?',
      type: 'choice',
      options: ['staging', 'production'],
      context: 'Deployment target',
    })).toMatchObject({
      success: true,
      clarification: true,
      question: 'Which environment?',
      type: 'choice',
      options: ['staging', 'production'],
      context: 'Deployment target',
      instruction: expect.stringMatching(/yanitlayin/),
    });
    expect(await tool.execute({ type: 'confirm' })).toEqual({ success: false, error: 'question gerekli' });
  });

  it('cross_session_memory lists and loads real session data and rejects a missing session', async () => {
    const home = isolatedHome('natureco-cross-session-');
    const sessionsDir = path.join(home, '.natureco', 'sessions');
    const memoryDir = path.join(home, '.natureco', 'memory');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });
    const session = {
      startedAt: '2026-07-20T10:00:00.000Z',
      messages: [{ role: 'user', content: 'Continue the coverage rock' }, { role: 'assistant', content: 'Ready' }],
    };
    fs.writeFileSync(path.join(sessionsDir, 'session-7.json'), JSON.stringify(session));
    fs.writeFileSync(path.join(memoryDir, 'ada.json'), JSON.stringify({ facts: [{ value: 'Prefers evidence' }], botName: 'ProofBot' }));
    const tool = require('../../src/tools/cross_session_memory');

    expect(await tool.execute({ action: 'list' })).toMatchObject({
      success: true,
      count: 1,
      sessions: [expect.objectContaining({ id: 'session-7', messageCount: 2, preview: 'Continue the coverage rock' })],
    });
    expect(await tool.execute({ action: 'load', sessionId: 'session-7' })).toEqual({ success: true, session });
    expect(await tool.execute({ action: 'context', sessionId: 'session-7', username: 'Ada' })).toMatchObject({
      success: true,
      sessionId: 'session-7',
      sessionMessageCount: 2,
      sources: ['memory', 'sessions'],
      context: expect.stringMatching(/Prefers evidence[\s\S]*Continue the coverage rock/),
    });
    expect(await tool.execute({ action: 'load', sessionId: 'absent' })).toMatchObject({ success: false, error: expect.stringMatching(/absent/) });
  });

  it('file_search walks a real directory tree and validates its pattern', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-file-search-'));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'root.txt'), 'root');
    fs.writeFileSync(path.join(root, 'nested', 'proof.txt'), 'proof');
    fs.writeFileSync(path.join(root, 'nested', 'ignore.log'), 'ignore');
    const tool = require('../../src/tools/file_search');

    const result = await tool.execute({ pattern: '**/*.txt', basePath: root, maxResults: 10 });
    expect(result).toMatchObject({ success: true, pattern: '**/*.txt', count: 2 });
    expect(result.results.map(item => item.name).sort()).toEqual(['proof.txt', 'root.txt']);
    expect(result.results.every(item => item.type === 'file' && item.size > 0)).toBe(true);
    expect(await tool.execute({ basePath: root })).toEqual({ success: false, error: 'pattern gerekli' });
  });

  it('pii_redact masks detected data while honoring preservation and validates text', async () => {
    const tool = require('../../src/tools/pii_redact');
    const result = await tool.execute({ text: 'Email ada@example.test from 192.168.1.5 using 4111 1111 1111 1111.' });
    expect(result).toMatchObject({ success: true, totalFindings: 3 });
    expect(result.redacted).toBe('Email [EMAIL] from [IP] using [CREDIT_CARD].');
    expect(result.findings.map(item => item.type)).toEqual(['email', 'credit_card', 'ip']);
    expect(await tool.execute({ text: 'Keep ada@example.test', preserveTypes: ['email'] })).toMatchObject({
      success: true, redacted: 'Keep ada@example.test', totalFindings: 0,
    });
    expect(await tool.execute({})).toEqual({ success: false, error: 'text gerekli' });
  });

  it('session_search searches real current and legacy session shapes and validates query', async () => {
    const home = isolatedHome('natureco-session-search-');
    const sessionsDir = path.join(home, '.natureco', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'current.json'), JSON.stringify({
      savedAt: '2026-07-20T10:00:00.000Z',
      messages: [{ role: 'user', content: 'Istanbul kalite kontrolü tamamlandı' }],
    }));
    fs.writeFileSync(path.join(sessionsDir, 'legacy.json'), JSON.stringify([
      { role: 'assistant', content: 'Kalite raporu hazır', timestamp: '2026-07-20T11:00:00.000Z' },
    ]));
    fs.writeFileSync(path.join(sessionsDir, 'broken.json'), '{not-json');
    const tool = require('../../src/tools/session_search');

    expect(await tool.execute({ query: 'kalite' })).toMatchObject({
      success: true,
      totalMatches: 2,
      results: expect.arrayContaining([
        expect.objectContaining({ session: 'current', role: 'user' }),
        expect.objectContaining({ session: 'legacy', role: 'assistant' }),
      ]),
    });
    expect(await tool.execute({ query: 'kalite', session: 'legacy' })).toMatchObject({
      success: true, totalMatches: 1, searchedSessions: ['legacy'],
    });
    expect(await tool.execute({})).toEqual({ success: false, error: 'query gerekli' });
  });

  it('skills_list discovers an isolated user skill and handles an empty category', async () => {
    const home = isolatedHome('natureco-skills-list-');
    const skillDir = path.join(home, '.natureco', 'skills', 'proof-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: proof-skill\ndescription: Real discovery proof\n---\n\nInstructions');
    const tool = require('../../src/tools/skills_list');

    const result = JSON.parse(await tool.execute({}));
    expect(result).toMatchObject({ success: true });
    expect(result.skills).toContainEqual(expect.objectContaining({
      name: 'proof-skill', description: 'Real discovery proof', category: 'general',
    }));
    expect(JSON.parse(await tool.execute({ category: 'does-not-exist' }))).toEqual({ success: true, skills: [] });
  });

  it('soul reads and summarizes isolated identity files and rejects an unknown action', async () => {
    const home = isolatedHome('natureco-soul-');
    const soulDir = path.join(home, '.natureco', 'soul');
    fs.mkdirSync(soulDir, { recursive: true });
    fs.writeFileSync(path.join(soulDir, 'SOUL.md'), '# Calm\n- Verify every claim');
    fs.writeFileSync(path.join(soulDir, 'IDENTITY.md'), '# Tester\nEvidence-first');
    const tool = require('../../src/tools/soul');

    const result = await tool.execute({ action: 'show' });
    expect(result).toMatchObject({ success: true, loaded: expect.any(Number), summary: expect.stringMatching(/Verify every claim/) });
    expect(result.files['SOUL.md']).toMatchObject({ path: expect.stringMatching(/^~/), content: expect.stringContaining('# Calm') });
    expect(tool.loadSoul()).toContain('Verify every claim');
    expect(await tool.execute({ action: 'unknown' })).toEqual({ success: false, error: 'Bilinmeyen action: unknown' });
  });
});
