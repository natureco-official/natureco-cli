import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('capital-İ matching across user-facing subsystems', () => {
  let tempHome;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-tr-match-'));
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('memory_search finds a capitalized İstanbul fact with lowercase istanbul', async () => {
    const memoryDir = path.join(tempHome, '.natureco', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      path.join(memoryDir, 'default.json'),
      JSON.stringify({ facts: [{ value: 'İstanbul toplantısı' }] }),
      'utf8'
    );

    const memorySearch = require('../../src/tools/memory_search');
    const result = await memorySearch.execute({ query: 'istanbul', scope: 'memory' });

    expect(result.found).toBe(1);
    expect(result.results[0].content).toContain('İstanbul');
    console.log(`[capital-İ proof][memory_search] query=istanbul found=${result.found} content=${result.results[0].content}`);
  });

  it('logs CLI finds capitalized İstanbul content with lowercase istanbul', () => {
    const naturecoDir = path.join(tempHome, '.natureco');
    fs.mkdirSync(naturecoDir, { recursive: true });
    fs.writeFileSync(path.join(naturecoDir, 'natureco.log'), '[info] İstanbul bağlantısı hazır\n', 'utf8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logs = require('../../src/commands/logs');
    logs(['search', 'istanbul']);
    const output = logSpy.mock.calls.flat().join('\n');
    logSpy.mockRestore();

    expect(output).toContain('Found 1 match(es)');
    expect(output).toContain('İstanbul');
    console.log('[capital-İ proof][logs CLI] query=istanbul matches=1 content=İstanbul bağlantısı hazır');
  });

  it('REPL identity merge matches capitalized İstanbul against lowercase username', () => {
    const memoryDir = path.join(tempHome, '.natureco', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(
      path.join(memoryDir, 'default.json'),
      JSON.stringify({ name: 'İstanbul', botName: 'İş Asistanı', facts: [] }),
      'utf8'
    );

    const repl = require('../../src/commands/repl');
    const memory = repl._internal.loadMemory('istanbul');

    expect(memory.botName).toBe('İş Asistanı');
    console.log(`[capital-İ proof][REPL identity] username=istanbul matchedName=İstanbul botName=${memory.botName}`);

    // v5.67.3: same require/tempHome — a second loadMemory call for a DIFFERENT username proves
    // foldTr's memory-filename fix also migrates a file saved under the old locale-mangled name
    // ('İzmir'.toLowerCase() has a combining-dot artifact) instead of silently orphaning it.
    const legacyName = 'İzmir'.toLowerCase();
    fs.writeFileSync(
      path.join(memoryDir, `${legacyName}.json`),
      JSON.stringify({ name: 'İzmir', botName: 'Eski Persona', facts: [{ value: 'legacy fact' }] }),
      'utf8'
    );
    const migrated = repl._internal.loadMemory('İzmir');
    expect(migrated.botName).toBe('Eski Persona');
    expect(migrated.facts.map((f) => f.value)).toContain('legacy fact');
    expect(fs.existsSync(path.join(memoryDir, 'izmir.json'))).toBe(true);
    console.log(`[capital-İ proof][memory filename migration] legacyName=${legacyName} migratedTo=izmir.json botName=${migrated.botName}`);
  });

  it('skills autoload matches capitalized GİT COMMIT against lowercase keyword', async () => {
    const skillDir = path.join(tempHome, '.natureco', 'skills', 'git-commit');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Git Commit\n', 'utf8');

    const skillsAutoload = require('../../src/tools/skills_autoload');
    const result = await skillsAutoload.execute({ message: 'GİT COMMIT mesajı hazırla' });

    expect(result.detectedSkills).toContain('git-commit');
    console.log(`[capital-İ proof][skills autoload] message="GİT COMMIT" detected=${result.detectedSkills.join(',')}`);
  });
});
