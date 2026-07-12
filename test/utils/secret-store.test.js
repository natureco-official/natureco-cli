import { describe, test, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SecretStore, MacKeychainBackend, WindowsDpapiBackend, EncryptedFileBackend } from '../../src/utils/secret-store.js';

const dirs = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('secret store', () => {
  test('encrypts file fallback with AES-GCM and never stores plaintext', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-secrets-')); dirs.push(dir);
    const file = path.join(dir, 'secrets.json');
    const store = new SecretStore(new EncryptedFileBackend({ masterKey: 'a strong test passphrase', file }));
    expect(store.set('provider.token', 'super-secret')).toMatchObject({ ok: true });
    expect(fs.readFileSync(file, 'utf8')).not.toContain('super-secret');
    expect(store.get('provider.token')).toEqual({ ok: true, value: 'super-secret' });
    expect(store.delete('provider.token')).toEqual({ ok: true });
    expect(store.get('provider.token').ok).toBe(false);
  });

  test('wrong key cannot decrypt ciphertext', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-secrets-')); dirs.push(dir);
    const file = path.join(dir, 'secrets.json');
    new EncryptedFileBackend({ masterKey: 'key-one', file }).set('x', 'secret');
    expect(new EncryptedFileBackend({ masterKey: 'key-two', file }).get('x')).toBeNull();
  });

  test('macOS keychain uses argument arrays without shell interpolation', () => {
    const execFile = vi.fn((bin, args, opts) => opts?.encoding ? 'value\n' : Buffer.from(''));
    const backend = new MacKeychainBackend('natureco-test', execFile);
    backend.set('token', 'secret;$(bad)');
    expect(execFile).toHaveBeenCalledWith('security', ['add-generic-password', '-U', '-a', 'token', '-s', 'natureco-test', '-w', 'secret;$(bad)'], { stdio: 'pipe' });
    expect(backend.get('token')).toBe('value');
  });

  test('Windows DPAPI uses a fixed encoded script and passes secrets through stdin', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-secrets-')); dirs.push(dir);
    const execFile = vi.fn(() => 'protected-value\n');
    const backend = new WindowsDpapiBackend({ file: path.join(dir, 'dpapi.json'), execFile });
    backend.set('token', 'secret;$(bad)');
    const [binary, args, options] = execFile.mock.calls[0];
    expect(binary).toBe('powershell.exe');
    expect(args).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)]);
    expect(options).toMatchObject({ input: 'secret;$(bad)', windowsHide: true });
  });

  test('rejects invalid names and empty values', () => {
    const store = new SecretStore({ set: vi.fn(), get: vi.fn(), delete: vi.fn() });
    expect(() => store.set('../token', 'x')).toThrow(/invalid secret name/);
    expect(() => store.set('token', '')).toThrow(/cannot be empty/);
  });
});
