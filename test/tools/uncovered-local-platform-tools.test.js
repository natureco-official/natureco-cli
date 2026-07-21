import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import childProcess from 'child_process';
import http from 'http';
import os from 'os';

const servers = [];

async function loopbackServer(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  while (servers.length) {
    const server = servers.pop();
    await new Promise(resolve => server.close(resolve));
  }
});

describe('previously uncovered local network and platform tools', () => {
  it('url_safety resolves a real loopback URL and rejects unsafe input', async () => {
    const baseUrl = await loopbackServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
    const tool = require('../../src/tools/url_safety');

    expect(await tool.execute({ url: `${baseUrl}/health`, checkType: 'full' })).toEqual({
      safe: true,
      issues: undefined,
      domain: '127.0.0.1',
      protocol: 'http:',
      url: `${baseUrl}/health`,
    });
    expect(await tool.execute({ url: 'https://evil.com/path' })).toMatchObject({
      safe: false, domain: 'evil.com', issues: ['Bilinen tehlikeli domain: evil.com'],
    });
    expect(await tool.execute({ url: 'not a URL' })).toEqual({ success: false, error: 'Gecersiz URL', safe: false });
  });

  it('voice_chat drives the macOS speech process boundary and validates text', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('darwin');
    const child = new EventEmitter();
    const spawn = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });
    const tool = require('../../src/tools/voice_chat');

    expect(await tool.execute({ action: 'speak', text: 'Coverage verified' })).toEqual({ success: true, provider: 'mac-say' });
    expect(spawn).toHaveBeenCalledWith('say', ['-v', 'Yelda', 'Coverage verified']);
    spawn.mockClear();
    expect(await tool.execute({ action: 'speak' })).toEqual({ success: false, error: 'text gerekli (speak icin)' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('web_readability extracts a real loopback article and rejects non-HTML content', async () => {
    const baseUrl = await loopbackServer((request, response) => {
      if (request.url === '/binary') {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        response.end('binary payload');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end([
        '<html><head><title>Local Proof</title><meta name="description" content="Loopback article"></head><body>',
        '<header>Hidden header</header><nav>Hidden navigation</nav>',
        '<p>This paragraph is deliberately long enough to qualify as meaningful readable content.</p>',
        '<p>Second paragraph proves extraction and truncation behavior.</p>',
        '<script>hiddenScript()</script></body></html>',
      ].join(''));
    });
    const tool = require('../../src/tools/web_readability');

    const result = await tool.execute({ url: `${baseUrl}/article`, maxChars: 60 });
    expect(result).toMatchObject({
      success: true,
      url: `${baseUrl}/article`,
      title: 'Local Proof',
      description: 'Loopback article',
      source: 'readability',
      truncated: true,
      totalChars: expect.any(Number),
      wordCount: expect.any(Number),
    });
    expect(result.content).toHaveLength(63);
    expect(result.content).toContain('This paragraph is deliberately long enough');
    expect(result.content).not.toContain('Hidden navigation');
    expect(await tool.execute({ url: `${baseUrl}/binary` })).toEqual({ success: false, error: 'URL does not contain HTML content' });
  });
});
