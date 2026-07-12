import { describe, test, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { LspClient } from '../../src/utils/lsp-client.js';

function fakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn() }; proc.kill = vi.fn();
  return proc;
}
function frame(message) { const body = Buffer.from(JSON.stringify(message)); return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]); }

describe('LSP client', () => {
  test('spawns without a shell and resolves framed JSON-RPC responses', async () => {
    const proc = fakeProcess();
    const spawnFn = vi.fn(() => proc);
    const client = new LspClient({ command: 'server', args: ['--stdio'], spawnFn, timeoutMs: 100 });
    const promise = client.request('demo', { value: 1 });
    expect(spawnFn).toHaveBeenCalledWith('server', ['--stdio'], expect.objectContaining({ shell: false, windowsHide: true }));
    const sent = proc.stdin.write.mock.calls[0][0].toString();
    expect(sent).toContain('Content-Length:');
    proc.stdout.emit('data', frame({ jsonrpc: '2.0', id: 1, result: { ok: true } }));
    await expect(promise).resolves.toEqual({ ok: true });
  });

  test('handles fragmented frames and server errors', async () => {
    const proc = fakeProcess();
    const client = new LspClient({ command: 'server', spawnFn: () => proc, timeoutMs: 100 });
    const promise = client.request('broken', {});
    const data = frame({ jsonrpc: '2.0', id: 1, error: { message: 'bad request' } });
    proc.stdout.emit('data', data.slice(0, 10)); proc.stdout.emit('data', data.slice(10));
    await expect(promise).rejects.toThrow('bad request');
  });

  test('times out and clears pending requests', async () => {
    const client = new LspClient({ command: 'server', spawnFn: () => fakeProcess(), timeoutMs: 5 });
    await expect(client.request('slow', {})).rejects.toThrow(/timed out/);
    expect(client.pending.size).toBe(0);
  });
});
