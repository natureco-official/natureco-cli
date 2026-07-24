import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const {
  createPresentationWriter,
  formatStatusLine,
  _sequences,
} = requireCjs('../src/utils/stream-render.js');
const tui = requireCjs('../src/utils/tui.js');

function sink(isTTY = true) {
  return {
    isTTY,
    columns: 80,
    value: '',
    write(chunk) { this.value += String(chunk); },
  };
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
  if (savedNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = savedNoColor;
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = savedForceColor;
});

describe('Rock D3 status line', () => {
  it('(a) formats model · usage · elapsed, truncates to width, and balances ANSI styles', () => {
    const full = formatStatusLine({
      model: 'gpt-5',
      usage: { prompt_tokens: 123, completion_tokens: 45 },
      elapsedSeconds: 7,
    }, { width: 80 });
    expect(full).toBe('gpt-5 · 123↑/45↓ · 7s');

    const clipped = formatStatusLine({
      model: 'a-very-long-model-name',
      inputTokens: 123,
      outputTokens: 45,
      elapsedSeconds: 7,
    }, {
      width: 14,
      style: text => `\x1b[36m${text}`,
    });
    expect(tui.stringWidth(clipped)).toBeLessThanOrEqual(14);
    expect(clipped).toMatch(/^\x1b\[36m/);
    expect(clipped).toMatch(/\x1b\[0m$/);
  });

  it.each([
    ['non-TTY', false, undefined],
    ['NO_COLOR', true, '1'],
    ['FORCE_COLOR=0', true, undefined, '0'],
  ])('(b) emits nothing for %s', (_name, isTTY, noColor, forceColor) => {
    if (noColor !== undefined) process.env.NO_COLOR = noColor;
    if (forceColor !== undefined) process.env.FORCE_COLOR = forceColor;
    const output = sink(isTTY);
    const writer = createPresentationWriter({ output, model: 'gpt-5' });
    const spinner = writer.startSpinner('Thinking');
    vi.advanceTimersByTime(200);
    spinner.stop();
    writer.updateStatus({ inputTokens: 1, outputTokens: 2 });
    writer.dispose();
    expect(output.value).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(c) clears a complete spinner line before a serialized card write', () => {
    const output = sink();
    const writer = createPresentationWriter({ output, model: 'gpt-5', status: false });
    writer.startSpinner('Running read_file');
    vi.advanceTimersByTime(80);
    writer.writeCommitted('[tool card]');

    const cardAt = output.value.indexOf('[tool card]');
    const clearAt = output.value.lastIndexOf(_sequences.ERASE_LINE, cardAt);
    expect(cardAt).toBeGreaterThan(0);
    expect(clearAt).toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(cardAt);
    expect(output.value.slice(clearAt, cardAt)).toBe(_sequences.ERASE_LINE);
    writer.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
