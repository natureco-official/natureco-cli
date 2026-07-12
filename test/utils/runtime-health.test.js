import { describe, test, expect, afterEach, vi } from 'vitest';
import fs from 'fs'; import os from 'os'; import path from 'path';
import { checkPidFile, checkDockerContainer, aggregateRuntimeHealth } from '../../src/utils/runtime-health.js';
const dirs = []; afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('daemon and container health', () => {
  test('detects running, stale and invalid PID files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-health-')); dirs.push(dir); const file = path.join(dir, 'daemon.pid');
    fs.writeFileSync(file, '123'); expect(checkPidFile(file, vi.fn())).toMatchObject({ ok: true, status: 'running', pid: 123 });
    expect(checkPidFile(file, () => { throw new Error('missing'); })).toMatchObject({ ok: false, status: 'stale' });
    fs.writeFileSync(file, 'bad'); expect(checkPidFile(file)).toMatchObject({ ok: false, status: 'invalid' });
  });
  test('parses Docker health without shell interpolation', () => {
    const execFile = vi.fn(() => JSON.stringify({ Running: true, Health: { Status: 'healthy' }, RestartCount: 1 }));
    expect(checkDockerContainer('natureco-sandbox', execFile)).toMatchObject({ ok: true, status: 'healthy', restartCount: 1 });
    expect(execFile).toHaveBeenCalledWith('docker', ['inspect', '--format', '{{json .State}}', 'natureco-sandbox'], expect.objectContaining({ timeout: 5000 }));
  });
  test('aggregates degraded runtime state', () => {
    expect(aggregateRuntimeHealth({ daemon: { ok: true }, docker: { ok: false } })).toMatchObject({ ok: false, status: 'degraded', failed: ['docker'] });
  });
});
