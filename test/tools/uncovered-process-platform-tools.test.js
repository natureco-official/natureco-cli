import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import childProcess from 'child_process';
import os from 'os';
import path from 'path';

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);
  child.unref = vi.fn();
  return child;
}

function reload(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('previously uncovered process tools', () => {
  it('async_delegation constructs, tracks, and cancels a child without launching it', async () => {
    const child = fakeChild();
    const spawn = vi.spyOn(childProcess, 'spawn').mockReturnValue(child);
    const tool = reload('../../src/tools/async_delegation');

    expect(await tool.execute({ action: 'start' })).toMatchObject({ success: false, error: expect.stringMatching(/prompt/) });
    expect(spawn).not.toHaveBeenCalled();
    const started = await tool.execute({ action: 'start', taskId: 'task-proof', prompt: 'inspect safely', model: 'test-model', toolset: 'read-only' });
    expect(started).toMatchObject({ success: true, taskId: 'task-proof', status: 'running' });
    expect(spawn).toHaveBeenCalledWith(process.execPath, [process.argv[1] || 'natureco', 'ask', 'inspect safely', '--model', 'test-model', '--toolset', 'read-only'], expect.objectContaining({
      detached: true, env: expect.objectContaining({ NATURECO_ASYNC: '1' }),
    }));
    expect(await tool.execute({ action: 'status', taskId: 'task-proof' })).toMatchObject({ success: true, status: 'running' });
    expect(await tool.execute({ action: 'cancel', taskId: 'task-proof' })).toMatchObject({ success: true, status: 'cancelled' });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('delegate_task validates agents and maps an intercepted child result', async () => {
    const child = fakeChild();
    const spawn = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('delegated result\n'));
        child.emit('close', 0);
      });
      return child;
    });
    const tool = reload('../../src/tools/delegate_task');

    expect(await tool.execute({})).toMatchObject({ success: false, error: expect.stringMatching(/task/) });
    expect(await tool.execute({ task: 'proof', agent: 'invalid' })).toMatchObject({ success: false, error: expect.stringMatching(/Gecersiz agent/) });
    expect(spawn).not.toHaveBeenCalled();
    expect(await tool.execute({ task: 'review safely', agent: 'review', timeoutMs: 1234 })).toMatchObject({
      success: true, task: 'review safely', agent: 'general', output: 'delegated result', exitCode: 0,
    });
    expect(spawn).toHaveBeenCalledWith('node', [path.resolve('bin/natureco.js'), 'ask', '"review safely"'], expect.objectContaining({ timeout: 1234 }));
  });
});

describe.runIf(os.platform() === 'win32')('previously uncovered macOS tools on Windows', () => {
  const cases = [
    ['calendar_add', { title: 'Proof' }, /macOS/i],
    ['mac_alarm', { action: 'set', time: '18:00' }, /macOS/i],
    ['mac_app_open', { appName: 'Safari' }, /macOS/i],
    ['mac_app_quit', { appName: 'Safari' }, /macOS/i],
    ['mac_notify', { title: 'Proof', message: 'Safe' }, /macOS/i],
    ['macos_screenshot', { region: 'full' }, /macOS/i],
    ['notes_add', { title: 'Proof', content: 'Safe' }, /macOS/i],
    ['reminder_add', { title: 'Proof' }, /macOS/i],
  ];

  it.each(cases)('%s returns its clean platform guard without spawning', async (name, params, message) => {
    const spawn = vi.spyOn(childProcess, 'spawn');
    const tool = reload(`../../src/tools/${name}`);
    expect(await tool.execute(params)).toMatchObject({ success: false, error: expect.stringMatching(message) });
    expect(spawn).not.toHaveBeenCalled();
  });
});
