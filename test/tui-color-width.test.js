import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');

const savedCaps = {};

beforeEach(() => {
  savedCaps.color = tui.CAPS.color;
  savedCaps.trueColor = tui.CAPS.trueColor;
  savedCaps.width = tui.CAPS.width;
  tui.CAPS.color = true;
  tui.CAPS.trueColor = true;
  tui.CAPS.width = 80;
});

afterEach(() => {
  tui.CAPS.color = savedCaps.color;
  tui.CAPS.trueColor = savedCaps.trueColor;
  tui.CAPS.width = savedCaps.width;
});

function isolatedCapabilities(environment) {
  const modulePath = path.resolve(__dirname, '../src/utils/tui.js');
  const script = [
    "Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });",
    `const tui = require(${JSON.stringify(modulePath)});`,
    'process.stdout.write(JSON.stringify(tui.detectCapabilities()));',
  ].join('');
  const env = { ...process.env };
  delete env.CI;
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  delete env.COLORTERM;
  delete env.TERM;
  Object.assign(env, environment);
  const child = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env,
  });
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout);
}

function expectBalanced(value) {
  for (const line of value.split('\n')) {
    if (line.includes('\x1b[')) expect(line).toMatch(/\x1b\[0m\s*$/);
  }
}

describe('Rock B color and display-width proof', () => {
  it('(a) emits xterm-256 foreground and box color when color is supported without truecolor', () => {
    tui.CAPS.color = true;
    tui.CAPS.trueColor = false;

    expect(tui.fg('#22c55e')).toContain('\x1b[38;5;');
    expect(tui.box(20, 3)).toContain('\x1b[38;5;');
  });

  it('(b) keeps the pre-existing truecolor foreground bytes unchanged', () => {
    tui.CAPS.color = true;
    tui.CAPS.trueColor = true;

    expect(tui.fg('#22c55e')).toBe('\x1b[38;2;34;197;94m');
  });

  it('(c) emits no foreground or reset escapes when color is disabled', () => {
    tui.CAPS.color = false;
    tui.CAPS.trueColor = false;

    expect(tui.fg('#22c55e')).toBe('');
    expect(tui.box(20, 3)).not.toContain('\x1b[');
    expect(tui.table([{ value: 'x' }], [{ key: 'value' }])).not.toContain('\x1b[');
  });

  it('(d) measures emoji, CJK, ASCII, and ANSI-styled text in display columns', () => {
    expect(tui.stringWidth('🌿')).toBe(2);
    expect(tui.stringWidth('中')).toBe(2);
    expect(tui.stringWidth('ab')).toBe(2);
    expect(tui.stringWidth(tui.styled('x', { color: '#fff' }))).toBe(1);
  });

  it('(e) pads, wraps, and truncates mixed graphemes at exact columns with balanced styles', () => {
    const mixed = '🌿👨‍👩‍👧e\u0301中';
    const styledMixed = tui.styled(mixed, { color: '#22c55e', bold: true });

    const padded = tui.padTo(styledMixed, 10);
    expect(tui.stringWidth(padded)).toBe(10);
    expectBalanced(padded);

    const wrapped = tui.wrapAnsi(tui.styled(mixed + mixed, { color: '#22c55e' }), 7);
    const wrappedLines = wrapped.split('\n');
    expect(wrappedLines).toHaveLength(2);
    expect(wrappedLines.map(tui.stringWidth)).toEqual([7, 7]);
    expect(wrappedLines.map(tui.stripAnsi)).toEqual([mixed, mixed]);
    expectBalanced(wrapped);

    const truncated = tui.truncateAnsi(
      tui.styled(mixed + '🌿', { color: '#22c55e' }),
      7,
    );
    expect(tui.stringWidth(truncated)).toBe(7);
    expect(tui.stripAnsi(truncated)).toBe(mixed);
    expectBalanced(truncated);
  });

  it('(f) detects truecolor, 256-color, no-color, and invalid COLORTERM in isolation', () => {
    expect(isolatedCapabilities({
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    })).toMatchObject({ color: true, trueColor: true });

    expect(isolatedCapabilities({
      TERM: 'xterm-256color',
    })).toMatchObject({ color: true, trueColor: false });

    expect(isolatedCapabilities({
      TERM: 'xterm-256color',
      NO_COLOR: '1',
    })).toMatchObject({ color: false, trueColor: false });

    expect(isolatedCapabilities({
      TERM: 'xterm-256color',
      COLORTERM: '256color',
    })).toMatchObject({ color: true, trueColor: false });
  });
});
