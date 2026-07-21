import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';

const tempDirs = [];

function isolatedHome(prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(home);
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  vi.resetModules();
  return home;
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
}

function connectError(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(null);
    });
    socket.once('error', resolve);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('live audit pass 2 regressions', () => {
  it('keeps the image provider response aligned with the actual request destination', async () => {
    isolatedHome('natureco-image-provider-');
    const savedEnv = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      FAL_KEY: process.env.FAL_KEY,
      TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
      MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.FAL_KEY;
    delete process.env.TOGETHER_API_KEY;
    delete process.env.MINIMAX_API_KEY;

    try {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      }));
      vi.stubGlobal('fetch', fetchMock);
      const imageGeneration = require('../../src/tools/image_generation');

      const explicit = await imageGeneration.execute({ prompt: 'proof', provider: 'openai', size: '1024x1024', n: 1 });
      expect(explicit).toMatchObject({ success: false, error: expect.stringMatching(/OpenAI.*key/i) });
      expect(fetchMock).not.toHaveBeenCalled();

      const fallback = await imageGeneration.execute({ prompt: 'proof' });
      expect(fallback).toMatchObject({ success: true, provider: 'pollinations', count: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/image\.pollinations\.ai\/prompt\//);
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('runs local workflow actions without config while run and plan still require it', async () => {
    isolatedHome('natureco-workflow-local-');
    const workflow = require('../../src/tools/workflow');

    const saved = await workflow.execute({ action: 'save', name: 'local-proof', steps: [] });
    expect(saved.success).toBe(true);
    expect(await workflow.execute({ action: 'load', workflowId: saved.workflowId })).toMatchObject({ success: true });
    expect(await workflow.execute({ action: 'list' })).toMatchObject({ success: true, workflows: [expect.objectContaining({ id: saved.workflowId })] });
    expect(await workflow.execute({ action: 'delete', workflowId: saved.workflowId })).toMatchObject({ success: true, deleted: true });
    expect(await workflow.execute({ action: 'run', task: 'no network' })).toMatchObject({ success: false, error: expect.stringMatching(/Provider ayarli degil/) });
    expect(await workflow.execute({ action: 'plan', task: 'no network' })).toMatchObject({ success: false, error: expect.stringMatching(/Provider ayarli degil/) });
  });

  it('starts and idempotently stops a real dashboard listener', async () => {
    const dashboard = require('../../src/tools/dashboard');
    const started = await dashboard.execute({ action: 'start', port: 0 });
    expect(started).toMatchObject({ success: true, port: expect.any(Number) });
    expect(await get(started.url)).toBe(200);

    expect(await dashboard.execute({ action: 'stop', port: started.port })).toMatchObject({ success: true, stopped: true });
    expect(await connectError(started.port)).toMatchObject({ code: 'ECONNREFUSED' });
    expect(await dashboard.execute({ action: 'stop', port: started.port })).toMatchObject({
      success: true, stopped: false, alreadyStopped: true,
    });
  });

  it('decodes DuckDuckGo redirect URLs and HTML entities in both extractors', async () => {
    const html = '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs%3Fa%3D1%26b%3D2&amp;rut=proof"><b>Example</b> &amp; Docs</a>' +
      '<a class="result__snippet">It&#x27;s clean &amp;amp; readable</a>';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => html })));

    const direct = await require('../../src/tools/duckduckgo').execute({ query: 'proof' });
    expect(direct.results[0]).toEqual({
      title: 'Example & Docs',
      snippet: "It's clean & readable",
      url: 'https://example.com/docs?a=1&b=2',
    });

    const DuckDuckGoProvider = require('../../src/providers/search/duckduckgo');
    const provider = await new DuckDuckGoProvider().search('proof');
    expect(provider.results[0]).toEqual(direct.results[0]);
  });

  it('returns the standard success envelope after a real structural rollback', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-structural-tool-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'proof.txt');
    fs.writeFileSync(file, 'before\n');
    const structuralPatch = require('../../src/tools/structural_patch');

    const applied = await structuralPatch.execute({
      action: 'apply', path: file, operations: [{ search: 'before', replace: 'after' }],
    });
    expect(applied).toMatchObject({ success: true, ok: true, id: expect.any(String) });
    expect(fs.readFileSync(file, 'utf8')).toBe('after\n');

    const rolledBack = await structuralPatch.execute({ action: 'rollback', patchId: applied.id });
    expect(rolledBack).toMatchObject({ success: true, ok: true });
    expect(fs.readFileSync(file, 'utf8')).toBe('before\n');
  });
});
