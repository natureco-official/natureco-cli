import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const codeV5 = requireCjs('../src/commands/code_v5.js');
const {
  createPresentationWriter,
  _sequences,
} = requireCjs('../src/utils/stream-render.js');
const { runInterruptibleTurn } = codeV5._presentation;

function terminal() {
  return {
    isTTY: true,
    columns: 80,
    value: '',
    write(chunk) {
      this.value += String(chunk);
      return true;
    },
  };
}

function inputTerminal() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = vi.fn(value => { input.isRaw = value; });
  input.resume = vi.fn();
  input.pause = vi.fn();
  return input;
}

let savedNoColor;
let savedForceColor;

beforeEach(() => {
  vi.useFakeTimers();
  savedNoColor = process.env.NO_COLOR;
  savedForceColor = process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = savedNoColor;
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = savedForceColor;
});

async function runCase(kind) {
  const output = terminal();
  const input = inputTerminal();
  const rl = { pause: vi.fn(), resume: vi.fn(), close: vi.fn() };
  const presentation = createPresentationWriter({
    output,
    model: 'gpt-5',
    status: false,
  });
  const body = async signal => {
    presentation.startSpinner(kind === 'tool-error' ? 'Running tool' : 'Thinking');
    if (kind === 'provider-error') throw new Error('provider failed');
    if (kind === 'tool-error') throw new Error('tool failed');
    if (kind === 'escape') {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    return 'done';
  };

  const turn = runInterruptibleTurn({ input, output, rl, presentation, body });
  if (kind === 'escape') {
    await Promise.resolve();
    input.emit('keypress', '', { name: 'escape' });
    await expect(turn).resolves.toMatchObject({ interrupted: true });
  } else if (kind.endsWith('error')) {
    await expect(turn).rejects.toThrow(kind === 'provider-error' ? 'provider failed' : 'tool failed');
  } else {
    await expect(turn).resolves.toMatchObject({ interrupted: false });
  }
  return { output, input, presentation };
}

describe('Rock D3 spinner lifecycle', () => {
  it.each(['normal', 'provider-error', 'tool-error', 'escape'])(
    '(d) disposes timer and restores cursor after %s',
    async kind => {
      const { output, input, presentation } = await runCase(kind);
      expect(presentation.isDisposed).toBe(true);
      expect(presentation.hasTimer).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(output.value).toContain(_sequences.CURSOR_SHOW);
      expect(output.value.lastIndexOf(_sequences.CURSOR_SHOW))
        .toBeGreaterThan(output.value.lastIndexOf(_sequences.CURSOR_HIDE));
      expect(input.isRaw).toBe(false);
    },
  );
});
