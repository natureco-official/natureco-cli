import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';

const tempDirs = [];
const modulesUnderTest = [
  '../../src/tools/workflow',
  '../../src/tools/file_state',
  '../../src/tools/plugin',
  '../../src/tools/memory',
  '../../src/utils/memory-store',
];

function clearModulesUnderTest() {
  for (const id of modulesUnderTest) {
    try { delete require.cache[require.resolve(id)]; } catch {}
  }
}

function tempHome(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  vi.spyOn(os, 'homedir').mockReturnValue(dir);
  return dir;
}

function mockHttps(responses) {
  return vi.spyOn(https, 'get').mockImplementation((url, _options, callback) => {
    const request = new EventEmitter();
    request.destroy = vi.fn();
    queueMicrotask(() => {
      const response = new EventEmitter();
      const file = String(url).split('/').pop();
      const spec = responses[file] || { status: 404, body: 'missing' };
      response.statusCode = spec.status;
      callback(response);
      queueMicrotask(() => {
        if (spec.error) request.emit('error', new Error(spec.error));
        else {
          response.emit('data', spec.body || '');
          response.emit('end');
        }
      });
    });
    return request;
  });
}

let originalHome;
let originalUserProfile;

beforeEach(() => {
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  clearModulesUnderTest();
  process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('workflow delete honest outcome', () => {
  it('reports a real deletion as successful and a missing workflow as unsuccessful', async () => {
    const home = tempHome('natureco-workflow-');
    fs.mkdirSync(path.join(home, '.natureco'), { recursive: true });
    fs.writeFileSync(path.join(home, '.natureco', 'config.json'), JSON.stringify({
      providerUrl: 'https://provider.invalid',
      providerApiKey: 'test-key',
    }));
    vi.resetModules();
    clearModulesUnderTest();
    const workflow = require('../../src/tools/workflow');

    const saved = await workflow.execute({ action: 'save', name: 'delete-proof', steps: [] });
    expect(saved.success).toBe(true);
    const deleted = await workflow.execute({ action: 'delete', workflowId: saved.workflowId });
    expect(deleted).toMatchObject({ success: true, deleted: true });

    const missing = await workflow.execute({ action: 'delete', workflowId: saved.workflowId });
    expect(missing).toMatchObject({ success: false, deleted: false });
    expect(missing.error).toMatch(/bulunamadi/i);
  });
});

describe('file_state untrack honest outcome', () => {
  it('uses the Map.delete result for tracked and untracked files', async () => {
    const home = tempHome('natureco-file-state-');
    const file = path.join(home, 'tracked.txt');
    fs.writeFileSync(file, 'tracked');
    vi.resetModules();
    clearModulesUnderTest();
    const fileState = require('../../src/tools/file_state');

    expect((await fileState.execute({ action: 'track', file })).success).toBe(true);
    expect(await fileState.execute({ action: 'untrack', file })).toMatchObject({ success: true, untracked: true });
    expect(await fileState.execute({ action: 'untrack', file })).toMatchObject({ success: false, untracked: false });
  });
});

describe('GitHub plugin installation honest outcome', () => {
  it('reports success only after all expected files are written', async () => {
    const home = tempHome('natureco-plugin-');
    vi.resetModules();
    clearModulesUnderTest();
    const plugin = require('../../src/tools/plugin');
    mockHttps({
      'plugin.json': { status: 200, body: JSON.stringify({ name: 'proof-plugin', version: '1.0.0' }) },
      'index.js': { status: 200, body: 'module.exports = { tools: [] };' },
      'README.md': { status: 200, body: '# Proof plugin' },
    });

    const result = await plugin.installFromGitHub('https://github.com/test/proof-plugin');
    expect(result.success).toBe(true);
    expect(result.downloaded).toEqual(['plugin.json', 'index.js', 'README.md']);
    expect(fs.existsSync(path.join(home, '.natureco', 'plugins', 'proof-plugin', 'index.js'))).toBe(true);
  });

  it('reports a non-2xx mandatory file and removes the partial directory', async () => {
    const home = tempHome('natureco-plugin-');
    vi.resetModules();
    clearModulesUnderTest();
    const plugin = require('../../src/tools/plugin');
    mockHttps({
      'plugin.json': { status: 200, body: JSON.stringify({ name: 'broken-plugin', version: '1.0.0' }) },
      'index.js': { status: 404, body: 'not found' },
      'README.md': { status: 200, body: '# Broken plugin' },
    });

    const result = await plugin.installFromGitHub('https://github.com/test/broken-plugin');
    expect(result).toMatchObject({ success: false, cleanedUp: true, missingMandatory: ['index.js'] });
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ file: 'index.js', written: false })]));
    expect(fs.existsSync(path.join(home, '.natureco', 'plugins', 'broken-plugin'))).toBe(false);
  });
});

describe('memory JSON bridge honest outcome', () => {
  it('reports both primary-store and bridge success', async () => {
    const home = tempHome('natureco-memory-');
    vi.resetModules();
    clearModulesUnderTest();
    const memory = require('../../src/tools/memory');
    const result = JSON.parse(await memory.execute({ action: 'add', target: 'user', username: 'proof', content: 'likes tea' }));

    expect(result).toMatchObject({ success: true, bridge: { success: true } });
    expect(fs.existsSync(path.join(home, '.natureco', 'memory', 'proof.json'))).toBe(true);
  });

  it('reports partial failure when the primary store writes but the JSON bridge cannot', async () => {
    const home = tempHome('natureco-memory-');
    vi.resetModules();
    clearModulesUnderTest();
    const memory = require('../../src/tools/memory');
    const realWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).endsWith('.json')) throw new Error('injected bridge write failure');
      return realWrite.call(fs, file, ...args);
    });

    const result = JSON.parse(await memory.execute({ action: 'add', target: 'user', username: 'proof', content: 'likes coffee' }));
    expect(result).toMatchObject({
      success: false,
      partial: true,
      bridge: { success: false, error: 'injected bridge write failure' },
    });
    expect(fs.readFileSync(path.join(home, '.natureco', 'memories', 'USER.md'), 'utf8')).toContain('likes coffee');
  });
});
