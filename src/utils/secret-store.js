'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { writeJsonAtomicSync, readJsonSafeSync } = require('./atomic-file');

class MacKeychainBackend {
  constructor(service = 'natureco-cli', execFile = execFileSync) { this.service = service; this.execFile = execFile; }
  set(key, value) { this.execFile('security', ['add-generic-password', '-U', '-a', key, '-s', this.service, '-w', value], { stdio: 'pipe' }); }
  get(key) { try { return this.execFile('security', ['find-generic-password', '-a', key, '-s', this.service, '-w'], { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch { return null; } }
  delete(key) { try { this.execFile('security', ['delete-generic-password', '-a', key, '-s', this.service], { stdio: 'pipe' }); return true; } catch { return false; } }
}

class LinuxSecretServiceBackend {
  constructor(service = 'natureco-cli', execFile = execFileSync) { this.service = service; this.execFile = execFile; }
  set(key, value) { this.execFile('secret-tool', ['store', '--label', `NatureCo ${key}`, 'service', this.service, 'account', key], { input: value, stdio: ['pipe', 'pipe', 'pipe'] }); }
  get(key) { try { return this.execFile('secret-tool', ['lookup', 'service', this.service, 'account', key], { encoding: 'utf8', stdio: 'pipe' }).trim() || null; } catch { return null; } }
  delete(key) { try { this.execFile('secret-tool', ['clear', 'service', this.service, 'account', key], { stdio: 'pipe' }); return true; } catch { return false; } }
}

class WindowsDpapiBackend {
  constructor(options = {}) { this.file = options.file || path.join(os.homedir(), '.natureco', 'secrets.dpapi.json'); this.execFile = options.execFile || execFileSync; }
  _run(script, input) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return this.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }).trim();
  }
  _load() { return readJsonSafeSync(this.file, { version: 1, entries: {} }); }
  _save(data) { fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 }); writeJsonAtomicSync(this.file, data, { mode: 0o600 }); }
  set(name, value) {
    const script = '$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($p)';
    const data = this._load(); data.entries[name] = { data: this._run(script, String(value)), updatedAt: new Date().toISOString() }; this._save(data);
  }
  get(name) {
    const entry = this._load().entries[name]; if (!entry) return null;
    try {
      const script = '$v=[Console]::In.ReadToEnd();$p=[Convert]::FromBase64String($v);$b=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($b)';
      return this._run(script, entry.data);
    } catch { return null; }
  }
  delete(name) { const data = this._load(); if (!data.entries[name]) return false; delete data.entries[name]; this._save(data); return true; }
}

class EncryptedFileBackend {
  constructor(options = {}) {
    if (!options.masterKey) throw new Error('NATURECO_MASTER_KEY is required for encrypted file secret storage');
    this.file = options.file || path.join(os.homedir(), '.natureco', 'secrets.enc.json');
    this.key = crypto.scryptSync(String(options.masterKey), 'natureco-secret-store-v1', 32);
  }
  _load() { return readJsonSafeSync(this.file, { version: 1, entries: {} }); }
  _save(data) { fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 }); writeJsonAtomicSync(this.file, data, { mode: 0o600 }); }
  set(name, value) {
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const data = this._load();
    data.entries[name] = { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64'), updatedAt: new Date().toISOString() };
    this._save(data);
  }
  get(name) {
    const entry = this._load().entries[name]; if (!entry) return null;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(entry.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(entry.data, 'base64')), decipher.final()]).toString('utf8');
    } catch { return null; }
  }
  delete(name) { const data = this._load(); if (!data.entries[name]) return false; delete data.entries[name]; this._save(data); return true; }
}

class SecretStore {
  constructor(backend) { if (!backend) throw new Error('secret store backend is required'); this.backend = backend; }
  _name(name) { if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name || '')) throw new Error('invalid secret name'); return name; }
  set(name, value) { if (value == null || value === '') throw new Error('secret value cannot be empty'); this.backend.set(this._name(name), String(value)); return { ok: true, name }; }
  get(name) { const value = this.backend.get(this._name(name)); return value == null ? { ok: false, error: 'secret not found' } : { ok: true, value }; }
  delete(name) { return { ok: this.backend.delete(this._name(name)) }; }
}

function createSecretStore(options = {}) {
  if (options.backend) return new SecretStore(options.backend);
  if (process.platform === 'darwin') return new SecretStore(new MacKeychainBackend(options.service, options.execFile));
  if (process.platform === 'win32') return new SecretStore(new WindowsDpapiBackend({ file: options.file, execFile: options.execFile }));
  if (process.platform === 'linux' && options.useSecretService !== false) return new SecretStore(new LinuxSecretServiceBackend(options.service, options.execFile));
  const masterKey = options.masterKey || process.env.NATURECO_MASTER_KEY;
  if (!masterKey) throw new Error('No OS keychain backend available. Set NATURECO_MASTER_KEY for encrypted fallback.');
  return new SecretStore(new EncryptedFileBackend({ masterKey, file: options.file }));
}

module.exports = { SecretStore, MacKeychainBackend, LinuxSecretServiceBackend, WindowsDpapiBackend, EncryptedFileBackend, createSecretStore };
