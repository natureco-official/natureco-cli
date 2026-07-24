import { PassThrough } from 'stream';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const codeV5 = requireCjs('../src/commands/code_v5.js');
const { runInterruptibleTurn } = codeV5._presentation;

function fakeTerminal(initialRaw = false) {
  const input = new PassThrough();
  Object.defineProperty(input, 'isTTY', { value: true, configurable: true });
  input.isRaw = initialRaw;
  input.setRawMode = vi.fn(value => {
    input.isRaw = value;
    return input;
  });
  const output = {
    value: '',
    write(chunk) {
      this.value += String(chunk);
      return true;
    },
  };
  const rl = {
    paused: false,
    closed: false,
    pause: vi.fn(() => { rl.paused = true; }),
    resume: vi.fn(() => { rl.paused = false; }),
    close: vi.fn(() => { rl.closed = true; }),
  };
  return { input, output, rl };
}

describe('Rock D2 simulated PTY lifecycle', () => {
  it('(f) Esc during a mocked network turn restores cooked mode and accepts the next prompt', async () => {
    const { input, output, rl } = fakeTerminal(false);
    let aborts = 0;
    const turn = runInterruptibleTurn({
      input,
      output,
      rl,
      body: signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborts++;
          reject(signal.reason);
        }, { once: true });
      }),
    });
    expect(input.listenerCount('keypress')).toBe(1);
    input.emit('keypress', '\u001b', { name: 'escape' });
    input.emit('keypress', '\u001b', { name: 'escape' });
    await expect(turn).resolves.toMatchObject({ interrupted: true, exited: false });
    expect(aborts).toBe(1);
    // Dil-agnostik: L(tr,en) ortam diline göre '⏹ kesildi' ya da '⏹ interrupted' basar.
    expect(output.value.match(/interrupted|kesildi/g)).toHaveLength(1);
    expect(input.listenerCount('keypress')).toBe(0);
    expect(input.isRaw).toBe(false);
    expect(rl.resume).toHaveBeenCalledTimes(1);

    let nextInput = '';
    input.once('data', chunk => { nextInput = String(chunk); });
    input.write('next answer\n');
    expect(nextInput).toBe('next answer\n');
  });

  it('(f) Esc during a non-cancellable tool shows waiting and restores raw state after it settles', async () => {
    const { input, output, rl } = fakeTerminal(false);
    let release;
    const turn = runInterruptibleTurn({
      input,
      output,
      rl,
      body: async (signal, activeTools) => {
        activeTools.add('slow_tool');
        await new Promise(resolve => { release = resolve; });
        activeTools.delete('slow_tool');
        signal.throwIfAborted();
      },
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    input.emit('keypress', '\u001b', { name: 'escape' });
    // Dil-agnostik: 'cancelling — waiting for slow_tool…' / 'iptal ediliyor — bekleniyor slow_tool…'
    expect(output.value).toMatch(/(cancelling — waiting for|iptal ediliyor — bekleniyor) slow_tool/);
    expect(input.isRaw).toBe(true);
    release();
    await expect(turn).resolves.toMatchObject({ interrupted: true });
    expect(input.isRaw).toBe(false);
    expect(rl.resume).toHaveBeenCalledOnce();
  });

  it('(f) restores the exact prior raw state and listener set when the body throws', async () => {
    const { input, output, rl } = fakeTerminal(true);
    const existing = vi.fn();
    input.on('keypress', existing);
    await expect(runInterruptibleTurn({
      input,
      output,
      rl,
      body: async () => { throw new Error('body failed'); },
    })).rejects.toThrow('body failed');
    expect(input.isRaw).toBe(true);
    expect(input.listeners('keypress')).toEqual([existing]);
    expect(rl.resume).toHaveBeenCalledOnce();
  });

  it('(f) Ctrl+C closes readline and does not print an interrupt card', async () => {
    const { input, output, rl } = fakeTerminal(false);
    const turn = runInterruptibleTurn({
      input,
      output,
      rl,
      body: signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    });
    input.emit('keypress', '\u0003', { name: 'c', ctrl: true });
    await expect(turn).resolves.toMatchObject({ interrupted: false, exited: true });
    expect(rl.close).toHaveBeenCalledOnce();
    expect(rl.resume).not.toHaveBeenCalled();
    expect(input.isRaw).toBe(false);
    expect(output.value).not.toMatch(/interrupted|kesildi/);
  });
});
