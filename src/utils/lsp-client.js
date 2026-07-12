'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const { pathToFileURL } = require('url');

class LspClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.command = options.command;
    this.args = options.args || [];
    this.cwd = options.cwd || process.cwd();
    this.timeoutMs = options.timeoutMs || 10000;
    this.spawnFn = options.spawnFn || spawn;
    this.process = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
  }

  start() {
    if (this.process) return this;
    if (!this.command) throw new Error('LSP command is required');
    this.process = this.spawnFn(this.command, this.args, {
      cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false,
    });
    this.process.stdout.on('data', chunk => this._onData(chunk));
    this.process.stderr?.on('data', chunk => this.emit('stderr', chunk.toString()));
    this.process.on('error', error => this._failAll(error));
    this.process.on('exit', code => { this._failAll(new Error(`LSP exited (${code})`)); this.process = null; });
    return this;
  }

  async initialize(capabilities = {}) {
    this.start();
    const rootUri = pathToFileURL(path.resolve(this.cwd)).href;
    const result = await this.request('initialize', {
      processId: process.pid, rootUri, capabilities,
      workspaceFolders: [{ uri: rootUri, name: path.basename(this.cwd) }],
    });
    this.notify('initialized', {});
    return result;
  }

  request(method, params, timeoutMs = this.timeoutMs) {
    this.start();
    const id = this.nextId++;
    this._send({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
    });
  }

  notify(method, params) { this.start(); this._send({ jsonrpc: '2.0', method, params }); }

  definition(filePath, line, character) {
    return this.request('textDocument/definition', {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line, character },
    });
  }

  references(filePath, line, character, includeDeclaration = true) {
    return this.request('textDocument/references', {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line, character }, context: { includeDeclaration },
    });
  }

  async stop() {
    if (!this.process) return;
    try { await this.request('shutdown', null, 2000); } catch {}
    try { this.notify('exit', null); } catch {}
    this.process.kill();
    this.process = null;
  }

  _send(message) {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    this.process.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString('ascii');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { this.buffer = this.buffer.slice(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.slice(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.slice(bodyStart + length);
      try { this._handle(JSON.parse(body)); } catch (error) { this.emit('protocolError', error); }
    }
  }

  _handle(message) {
    if (message.id != null && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'LSP error'));
      else pending.resolve(message.result);
    } else this.emit('notification', message);
  }

  _failAll(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}

const DEFAULT_SERVERS = {
  javascript: { command: 'typescript-language-server', args: ['--stdio'] },
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  python: { command: 'pyright-langserver', args: ['--stdio'] },
  rust: { command: 'rust-analyzer', args: [] },
  go: { command: 'gopls', args: [] },
};

module.exports = { LspClient, DEFAULT_SERVERS };
