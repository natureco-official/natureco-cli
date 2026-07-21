import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import https from 'https';
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

function jsonResponse(payload, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

function emitHttpsResponse(callback, statusCode, payload) {
  const response = new EventEmitter();
  response.statusCode = statusCode;
  callback(response);
  queueMicrotask(() => {
    response.emit('data', typeof payload === 'string' ? payload : JSON.stringify(payload));
    response.emit('end');
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('previously uncovered paid and external search boundaries', () => {
  it('exa_search guards credentials and maps an intercepted search request', async () => {
    isolatedHome('natureco-exa-search-');
    delete process.env.EXA_API_KEY;
    const untouched = vi.fn();
    vi.stubGlobal('fetch', untouched);
    const tool = require('../../src/tools/exa_search');

    expect(await tool.execute({ query: 'coverage proof' })).toMatchObject({ success: false, error: expect.stringMatching(/API key/) });
    expect(untouched).not.toHaveBeenCalled();

    const fetchMock = vi.fn(async () => jsonResponse({ results: [{
      title: 'Proof', text: 'Boundary verified', url: 'https://example.test/proof', score: 0.9, publishedDate: '2026-07-20',
    }] }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.EXA_API_KEY = 'test-exa-key';
    expect(await tool.execute({ query: 'coverage proof', type: 'neural', maxResults: 2, includeText: ['verified'], excludeText: ['ads'] })).toMatchObject({
      success: true,
      query: 'coverage proof',
      count: 1,
      source: 'exa',
      results: [{ title: 'Proof', snippet: 'Boundary verified', url: 'https://example.test/proof', score: 0.9, publishedDate: '2026-07-20' }],
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.exa.ai/search', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-api-key': 'test-exa-key' }),
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      query: 'coverage proof', type: 'neural', numResults: 2, includeTerms: ['verified'], excludeTerms: ['ads'],
    });
  });

  it('firecrawl guards credentials and maps an intercepted scrape request', async () => {
    isolatedHome('natureco-firecrawl-');
    delete process.env.FIRECRAWL_API_KEY;
    const untouched = vi.fn();
    vi.stubGlobal('fetch', untouched);
    const tool = require('../../src/tools/firecrawl');

    expect(await tool.execute({ url: 'https://example.test/article' })).toMatchObject({ success: false, error: expect.stringMatching(/API key/) });
    expect(untouched).not.toHaveBeenCalled();

    const fetchMock = vi.fn(async () => jsonResponse({ data: {
      markdown: '# Verified article', metadata: { title: 'Proof', description: 'Safe intercepted result' },
    } }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';
    expect(await tool.execute({ url: 'https://example.test/article', formats: ['markdown', 'html'] })).toEqual({
      success: true,
      url: 'https://example.test/article',
      mode: 'scrape',
      content: '# Verified article',
      title: 'Proof',
      description: 'Safe intercepted result',
      source: 'firecrawl',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.firecrawl.dev/v1/scrape', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-firecrawl-key' }),
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ url: 'https://example.test/article', formats: ['markdown', 'html'] });
  });

  it('llm_task validates intercepted JSON output and rejects schema mismatches', async () => {
    isolatedHome('natureco-llm-task-');
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '```json\n{"answer":42,"ready":true}\n```' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/llm_task');
    const schema = { type: 'object', properties: { answer: { type: 'number', required: true }, ready: { type: 'boolean' } } };

    expect(await tool.execute({
      prompt: 'Return the verified answer', input: { source: 'test' }, schema, provider: 'openai', model: 'test-model', apiKey: 'test-key', temperature: '0.2', maxTokens: '128',
    })).toEqual({ success: true, data: { answer: 42, ready: true }, provider: 'openai', model: 'test-model' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    }));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({ model: 'test-model', temperature: 0.2, max_tokens: 128 });
    expect(request.messages[0].content).toContain('"source": "test"');

    const mismatch = await tool.execute({
      prompt: 'Return output', schema: { type: 'object', properties: { answer: { type: 'string', required: true } } }, provider: 'openai', apiKey: 'test-key',
    });
    expect(mismatch).toMatchObject({ success: false, error: expect.stringMatching(/answer: expected string, got number/), parsed: { answer: 42, ready: true } });
  });

  it('searxng_search constructs a private-instance query and surfaces HTTP errors', async () => {
    isolatedHome('natureco-searxng-');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ results: [
        { title: 'One', content: 'First', url: 'https://example.test/1', engine: 'engine-a', category: 'news' },
        { title: 'Two', content: 'Second', url: 'https://example.test/2', engine: 'engine-b', category: 'news' },
      ] }))
      .mockResolvedValueOnce(jsonResponse('unavailable', 503, 'Unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/searxng');

    expect(await tool.execute({ query: 'privacy proof', instanceUrl: 'https://search.example.test///', categories: 'news', maxResults: 1 })).toMatchObject({
      success: true,
      query: 'privacy proof',
      instance: 'https://search.example.test',
      count: 1,
      source: 'searxng',
      results: [{ title: 'One', snippet: 'First', url: 'https://example.test/1', engine: 'engine-a', category: 'news' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://search.example.test/search?q=privacy+proof&format=json&language=en&categories=news&pageno=1');
    expect(await tool.execute({ query: 'failure', instanceUrl: 'https://search.example.test' })).toEqual({ success: false, error: 'SearXNG error: 503' });
  });

  it('web_search runs the selected provider and returns its real error result', async () => {
    isolatedHome('natureco-web-search-');
    const html = '<a rel="nofollow" class="result__a" href="https://example.test/proof"><b>Coverage</b> Proof</a><a class="result__snippet">A &amp; B verified</a>';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ...jsonResponse(html), text: async () => html })
      .mockResolvedValueOnce(jsonResponse('blocked', 429, 'Too Many Requests'));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/web_search');

    expect(await tool.execute({ query: 'coverage proof', provider: 'duckduckgo', maxResults: 1 })).toEqual({
      success: true,
      query: 'coverage proof',
      results: [{ title: 'Coverage Proof', snippet: 'A & B verified', url: 'https://example.test/proof' }],
      count: 1,
      provider: 'duckduckgo',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://html.duckduckgo.com/html/?q=coverage%20proof');
    expect(await tool.execute({ query: 'rate limited', provider: 'duckduckgo' })).toEqual({
      success: false, error: 'DuckDuckGo error: 429', provider: 'duckduckgo',
    });
  });

  it('parallel_search executes real providers concurrently and rejects an empty valid set', async () => {
    isolatedHome('natureco-parallel-search-');
    process.env.EXA_API_KEY = 'test-exa-key';
    const fetchMock = vi.fn(async (url) => {
      if (url === 'https://api.exa.ai/search') {
        return jsonResponse({ results: [{ title: 'Exa proof', text: 'Exa result', url: 'https://example.test/exa' }] });
      }
      return jsonResponse({ results: [{ title: 'SearX proof', content: 'SearX result', url: 'https://example.test/searx' }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/parallel_search');

    expect(await tool.execute({ query: 'parallel proof', maxResults: 2, providers: ['searxng', 'exa'] })).toMatchObject({
      success: true,
      query: 'parallel proof',
      count: 2,
      providersUsed: ['searxng', 'exa'],
      results: expect.arrayContaining([
        expect.objectContaining({ title: 'SearX proof', _provider: 'searxng' }),
        expect.objectContaining({ title: 'Exa proof', _provider: 'exa' }),
      ]),
    });
    fetchMock.mockClear();
    expect(await tool.execute({ query: 'none', providers: ['not-registered'] })).toEqual({
      success: false, error: 'Kullanilabilir search provider bulunamadi',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('spotify exchanges credentials and maps search data without reaching Spotify', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    const request = vi.spyOn(https, 'request');
    const tool = require('../../src/tools/spotify');
    expect(await tool.execute({ action: 'search', query: 'proof' })).toMatchObject({ success: false, error: expect.stringMatching(/SPOTIFY_CLIENT_ID/) });
    expect(request).not.toHaveBeenCalled();

    const responses = [
      [200, { access_token: 'test-token' }],
      [200, {
        tracks: { items: [{ id: 'track-1', name: 'Proof Song', artists: [{ name: 'Tester' }], album: { name: 'Suite' }, external_urls: { spotify: 'https://open.spotify.test/track-1' } }] },
        albums: { items: [{ id: 'album-1', name: 'Suite', artists: [{ name: 'Tester' }] }] },
      }],
    ];
    request.mockImplementation((_target, options, callback) => {
      const responseCallback = callback || options;
      const req = new EventEmitter();
      req.write = vi.fn();
      req.end = vi.fn(() => {
        const [status, payload] = responses.shift();
        emitHttpsResponse(responseCallback, status, payload);
      });
      req.destroy = vi.fn();
      return req;
    });
    expect(await tool.execute({ action: 'search', query: 'proof song', clientId: 'client', clientSecret: 'secret' })).toMatchObject({
      success: true,
      query: 'proof song',
      tracks: [{ id: 'track-1', name: 'Proof Song', artist: 'Tester', album: 'Suite', url: 'https://open.spotify.test/track-1' }],
      albums: [{ id: 'album-1', name: 'Suite', artist: 'Tester' }],
    });
    expect(request.mock.calls[0][0]).toBe('https://accounts.spotify.com/api/token');
    expect(request.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('client:secret').toString('base64')}`);
    expect(request.mock.calls[1][0]).toMatchObject({
      hostname: 'api.spotify.com', path: '/v1/search?q=proof%20song&type=track,album,artist&limit=10', method: 'GET',
    });
  });

  it('x_search guards credentials and maps an intercepted Twitter response', async () => {
    delete process.env.X_API_KEY;
    delete process.env.TWITTER_API_KEY;
    const get = vi.spyOn(https, 'get');
    const tool = require('../../src/tools/x_search');
    expect(await tool.execute({ query: 'coverage' })).toMatchObject({ success: false, error: expect.stringMatching(/X API/) });
    expect(get).not.toHaveBeenCalled();

    get.mockImplementation((url, options, callback) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      queueMicrotask(() => emitHttpsResponse(callback, 200, {
        data: [{ id: 'tweet-1', text: 'Coverage verified', created_at: '2026-07-20', public_metrics: { like_count: 7, retweet_count: 2 } }],
        meta: { result_count: 1 },
      }));
      return req;
    });
    expect(await tool.execute({ query: 'coverage proof', maxResults: 250, apiKey: 'test-x-key' })).toEqual({
      success: true,
      query: 'coverage proof',
      count: 1,
      tweets: [{ id: 'tweet-1', text: 'Coverage verified', createdAt: '2026-07-20', likes: 7, retweets: 2 }],
      meta: { result_count: 1 },
    });
    expect(get.mock.calls[0][0]).toBe('https://api.twitter.com/2/tweets/search/recent?query=coverage%20proof&max_results=100&tweet.fields=created_at,public_metrics');
    expect(get.mock.calls[0][1].headers.Authorization).toBe('Bearer test-x-key');
  });
});
