/**
 * v5.43 GÜVENLİK — admin-rpc kimlik doğrulama + bind + maskeleme (Madde 8).
 *
 * Eskiden sunucu 0.0.0.0'da, kimlik doğrulamasız dinliyordu → config.get ile tüm API
 * key'ler ağdan okunabilir, config.set ile providerUrl kaçırılabilirdi. Artık zorunlu
 * bearer token + localhost bind + secret maskeleme.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import http from 'http';

const TEST_HOME = path.join(os.tmpdir(), `nc-adminrpc-${Date.now()}`);
const PORT = 39231;

function postJson(port, bodyObj, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(bodyObj);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/', headers, timeout: 3000 }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(b); } catch { return b; } })() }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('admin-rpc — maskSecrets', () => {
  let adminRpc;
  beforeEach(async () => { vi.resetModules(); adminRpc = (await import('../../src/commands/admin-rpc.js')).default; });
  it('hassas alanları maskeler, normal alanları bırakır', () => {
    const m = adminRpc.maskSecrets({ providerApiKey: 'sk-secret-abcdef123', name: 'gencay', nested: { telegramToken: '12345:AAsecret' } }, false);
    expect(m.providerApiKey).not.toContain('secret');
    expect(m.providerApiKey).toMatch(/\*\*\*\*/);
    expect(m.name).toBe('gencay');
    expect(m.nested.telegramToken).not.toContain('secret');
  });
  it('reveal:true ile tam değer döner', () => {
    const m = adminRpc.maskSecrets({ providerApiKey: 'sk-secret-abcdef123' }, true);
    expect(m.providerApiKey).toBe('sk-secret-abcdef123');
  });
});

describe('admin-rpc — auth + bind (Madde 8)', () => {
  let adminRpc;
  beforeEach(async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    if (!fs.existsSync(TEST_HOME)) fs.mkdirSync(TEST_HOME, { recursive: true });
    vi.resetModules();
    adminRpc = (await import('../../src/commands/admin-rpc.js')).default;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    adminRpc.startAdmin(String(PORT));
    await new Promise(r => setTimeout(r, 250));
  });
  afterEach(async () => {
    try { adminRpc.stopAdmin(); } catch {}
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
    vi.restoreAllMocks();
  });

  it('tokensiz istek 401 döner', async () => {
    const r = await postJson(PORT, { method: 'health' }, null);
    expect(r.status).toBe(401);
  });
  it('yanlış token 401 döner', async () => {
    const r = await postJson(PORT, { method: 'health' }, 'yanlis-token');
    expect(r.status).toBe(401);
  });
  it('doğru token ile health 200', async () => {
    const token = fs.readFileSync(path.join(TEST_HOME, '.natureco', 'admin-token'), 'utf8').trim();
    const r = await postJson(PORT, { method: 'health' }, token);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
  it('admin-token dosyası 0o600 (POSIX)', () => {
    const tokenFile = path.join(TEST_HOME, '.natureco', 'admin-token');
    expect(fs.existsSync(tokenFile)).toBe(true);
    if (process.platform !== 'win32') {
      expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600);
    }
  });
});
