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

function mockHttpsResponse(statusCode, payload) {
  return vi.spyOn(https, 'request').mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter();
    request.write = vi.fn();
    request.end = vi.fn(() => {
      const response = new EventEmitter();
      response.statusCode = statusCode;
      callback(response);
      queueMicrotask(() => {
        if (payload !== undefined) response.emit('data', typeof payload === 'string' ? payload : JSON.stringify(payload));
        response.emit('end');
      });
    });
    request.destroy = vi.fn();
    return request;
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

describe('previously uncovered external-boundary tools', () => {
  it('send_message delivers locally and blocks incomplete external requests', async () => {
    const tool = require('../../src/tools/send_message');
    expect(await tool.execute({ to: 'operator' })).toMatchObject({ success: false, error: expect.stringMatching(/message/) });
    expect(await tool.execute({ to: 'operator', message: 'build passed', platform: 'terminal' })).toEqual({
      success: true,
      platform: 'terminal',
      to: 'operator',
      message: 'build passed',
      delivered: true,
      note: 'Mesaj terminale yazdirildi (dis ortama gonderilmedi)',
    });
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    expect(await tool.execute({ to: 'nobody@example.test', message: 'do not send', platform: 'email' })).toMatchObject({ success: false });
  });

  it('homeassistant maps a real-shaped API response and never calls it without credentials', async () => {
    delete process.env.HASS_URL;
    delete process.env.HOME_ASSISTANT_URL;
    delete process.env.HASS_TOKEN;
    delete process.env.HOME_ASSISTANT_TOKEN;
    const tool = require('../../src/tools/homeassistant');
    const request = vi.spyOn(https, 'request');
    expect(await tool.execute({ action: 'get_states' })).toMatchObject({ success: false, error: expect.stringMatching(/HASS_URL/) });
    expect(request).not.toHaveBeenCalled();

    process.env.HASS_URL = 'https://home.invalid/';
    process.env.HASS_TOKEN = 'test-token';
    const api = mockHttpsResponse(200, [{ entity_id: 'light.desk', state: 'on', attributes: { friendly_name: 'Desk' }, last_changed: '2026-01-01' }]);
    const result = await tool.execute({ action: 'get_states' });
    expect(result).toMatchObject({ success: true, count: 1, entities: [{ entityId: 'light.desk', state: 'on', friendlyName: 'Desk' }] });
    expect(api).toHaveBeenCalledWith('https://home.invalid/api/states', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }), expect.any(Function));
  });

  it('microsoft_graph parses a list response and guards email before any request', async () => {
    delete process.env.MS_GRAPH_TOKEN;
    delete process.env.MICROSOFT_GRAPH_TOKEN;
    const tool = require('../../src/tools/microsoft_graph');
    const untouched = vi.spyOn(https, 'request');
    expect(await tool.execute({ action: 'list_emails' })).toMatchObject({ success: false, error: expect.stringMatching(/MS_GRAPH_TOKEN/) });
    expect(untouched).not.toHaveBeenCalled();

    process.env.MS_GRAPH_TOKEN = 'test-token';
    const api = mockHttpsResponse(200, { value: [{ id: 'm1', subject: 'Proof', from: { emailAddress: { address: 'sender@example.test' } }, receivedDateTime: '2026-01-01', isRead: false }] });
    expect(await tool.execute({ action: 'list_emails', top: 1 })).toMatchObject({
      success: true, count: 1, emails: [{ id: 'm1', subject: 'Proof', from: 'sender@example.test', receivedAt: '2026-01-01', isRead: false }],
    });
    expect(api.mock.calls.at(-1)[0]).toContain('/me/messages?$top=1');
    api.mockClear();
    expect(await tool.execute({ action: 'send_email', to: 'recipient@example.test' })).toMatchObject({ success: false, error: expect.stringMatching(/subject/) });
    expect(api).not.toHaveBeenCalled();
  });

  it('speech_to_text constructs Deepgram URL and local-file transcription requests', async () => {
    const home = isolatedHome('natureco-stt-');
    const audio = path.join(home, 'sample.wav');
    fs.writeFileSync(audio, Buffer.from([1, 2, 3]));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: { channels: [{ alternatives: [{ transcript: 'hello test world' }] }] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/speech_to_text');

    expect(await tool.execute({ provider: 'deepgram', apiKey: 'test-key' })).toMatchObject({ success: false, error: expect.stringMatching(/audioPath/) });
    expect(await tool.execute({ provider: 'deepgram', apiKey: 'test-key', audioUrl: 'https://example.test/sample.wav', language: 'en' })).toMatchObject({
      success: true, provider: 'deepgram', transcript: 'hello test world', wordCount: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepgram.com/v1/listen?url=https%3A%2F%2Fexample.test%2Fsample.wav&model=nova-2&language=en&smart_format=true', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Token test-key' }),
    }));

    expect(await tool.execute({ provider: 'deepgram', apiKey: 'test-key', audioPath: audio, language: 'tr' })).toMatchObject({
      success: true, provider: 'deepgram', transcript: 'hello test world', wordCount: 3,
    });
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.deepgram.com/v1/listen?model=nova-2&language=tr&smart_format=true', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Token test-key', 'Content-Type': 'audio/wav' }), body: expect.any(Buffer),
    }));
  });

  it('audio_understanding transcribes a real temp file with an intercepted provider call', async () => {
    const home = isolatedHome('natureco-audio-understanding-');
    const audio = path.join(home, 'sample.wav');
    fs.writeFileSync(audio, Buffer.from([5, 6, 7]));
    process.env.DEEPGRAM_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: { channels: [{ alternatives: [{ transcript: 'safe transcript' }] }] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/audio_understanding');

    expect(await tool.execute({ action: 'transcribe', transcriptionProvider: 'deepgram' })).toMatchObject({ success: false, error: expect.stringMatching(/audioPath/) });
    expect(await tool.execute({ action: 'transcribe', transcriptionProvider: 'deepgram', audioPath: audio })).toMatchObject({
      success: true, action: 'transcribe', transcript: 'safe transcript', transcriptionProvider: 'deepgram',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepgram.com/v1/listen', expect.objectContaining({ method: 'POST', body: expect.any(Buffer) }));
  });

  it('media_understanding encodes a local image and maps an intercepted OpenAI response', async () => {
    const home = isolatedHome('natureco-media-understanding-');
    const image = path.join(home, 'pixel.png');
    fs.writeFileSync(image, Buffer.from([137, 80, 78, 71]));
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'a tiny test image' } }] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/media_understanding');

    expect(await tool.execute({ provider: 'openai', apiKey: 'test-key' })).toMatchObject({ success: false, error: expect.stringMatching(/imagePath/) });
    expect(await tool.execute({ provider: 'openai', apiKey: 'test-key', imagePath: image, prompt: 'Describe' })).toMatchObject({
      success: true, provider: 'openai', analysis: 'a tiny test image',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual(expect.arrayContaining([
      { type: 'text', text: 'Describe' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString('base64')}`, detail: 'high' } },
    ]));
  });

  it('music_generation maps an intercepted Suno result and rejects unknown providers', async () => {
    isolatedHome('natureco-music-');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: { clips: [{ id: 'clip-1', url: 'https://example.test/clip.mp3' }] } }) }));
    vi.stubGlobal('fetch', fetchMock);
    const tool = require('../../src/tools/music_generation');

    expect(await tool.execute({ prompt: 'quiet piano', provider: 'unknown' })).toMatchObject({ success: false, error: expect.stringMatching(/Unsupported provider/) });
    expect(await tool.execute({ prompt: 'quiet piano', provider: 'suno', apiKey: 'test-key', duration: 12, style: 'ambient' })).toMatchObject({
      success: true, provider: 'suno', count: 1, music: [{ id: 'clip-1', url: 'https://example.test/clip.mp3' }],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ prompt: 'quiet piano', duration: 12, style: 'ambient' });
  });

  it('skill_generate writes provider output only after a successful intercepted response', async () => {
    const home = isolatedHome('natureco-skill-generate-');
    const configDir = path.join(home, '.natureco');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ providerUrl: 'https://provider.invalid/v1', providerApiKey: 'test-key', providerModel: 'test-model' }));
    const generated = 'Use read_file on the input.\nValidate paths first.\nWrite only to the requested output.\nCheck the result.\nReport exact failures.\nExample: process input.txt safely.';
    const api = mockHttpsResponse(200, { choices: [{ message: { content: generated } }] });
    const tool = require('../../src/tools/skill_generate');

    expect(await tool.execute({})).toMatchObject({ success: false, error: expect.stringMatching(/taskDescription/) });
    expect(await tool.execute({ taskDescription: 'Process a safe text file', skillName: 'safe-text' })).toMatchObject({ success: true, skillName: 'safe-text' });
    expect(fs.readFileSync(path.join(home, '.natureco', 'skills', 'safe-text', 'SKILL.md'), 'utf8')).toBe(generated);
    expect(JSON.parse(fs.readFileSync(path.join(home, '.natureco', 'skills', 'safe-text', 'metadata.json'), 'utf8'))).toMatchObject({ name: 'safe-text', autoGenerated: true });
    expect(api).toHaveBeenCalledWith('https://provider.invalid/v1/chat/completions', expect.objectContaining({ method: 'POST' }), expect.any(Function));
  });
});
