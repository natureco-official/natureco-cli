import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');
const {
  canUseInputBox,
  createTextModel,
  insertIntoModel,
  renderFrame,
  promptInput,
  getKeypressTransport,
} = requireCjs('../src/utils/input-box.js');
const codeV5 = requireCjs('../src/commands/code_v5.js');

class MiniTerminal {
  constructor() {
    this.rows = [[]];
    this.cursor = { row: 0, col: 0 };
    this.visible = true;
  }

  ensureRow(row) {
    while (this.rows.length <= row) this.rows.push([]);
  }

  write(value) {
    const source = String(value);
    let index = 0;
    while (index < source.length) {
      if (source[index] === '\x1b' && source[index + 1] === '[') {
        const match = source.slice(index).match(/^\x1b\[([0-9;?]*)([A-Za-z~])/);
        if (match) {
          const [, params, command] = match;
          const amount = Number(params || 1);
          if (command === 'm' || command === '~') {
            // styling and bracketed-paste control do not occupy cells
          } else if (command === 'A') {
            this.cursor.row = Math.max(0, this.cursor.row - amount);
          } else if (command === 'B') {
            this.cursor.row += amount;
            this.ensureRow(this.cursor.row);
          } else if (command === 'C') {
            this.cursor.col += amount;
          } else if (command === 'D') {
            this.cursor.col = Math.max(0, this.cursor.col - amount);
          } else if (command === 'G') {
            this.cursor.col = Math.max(0, amount - 1);
          } else if (command === 'K' && (params === '2' || params === '')) {
            this.ensureRow(this.cursor.row);
            this.rows[this.cursor.row] = [];
          } else if (command === 'h' && params === '?25') {
            this.visible = true;
          } else if (command === 'l' && params === '?25') {
            this.visible = false;
          }
          index += match[0].length;
          continue;
        }
      }
      if (source[index] === '\r') {
        this.cursor.col = 0;
        index++;
        continue;
      }
      if (source[index] === '\n') {
        this.cursor.row++;
        this.ensureRow(this.cursor.row);
        index++;
        continue;
      }
      const grapheme = Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          .segment(source.slice(index)),
        part => part.segment
      )[0];
      const width = tui.stringWidth(grapheme);
      this.ensureRow(this.cursor.row);
      this.rows[this.cursor.row][this.cursor.col] = grapheme;
      for (let col = 1; col < width; col++) {
        this.rows[this.cursor.row][this.cursor.col + col] = '';
      }
      this.cursor.col += width;
      index += grapheme.length;
    }
  }

  screen() {
    const lines = this.rows.map(row => {
      let last = row.length - 1;
      while (last >= 0 && (row[last] === undefined || row[last] === ' ')) last--;
      return row.slice(0, last + 1).map(cell => cell ?? ' ').join('');
    });
    while (lines.length > 1 && lines.at(-1) === '') lines.pop();
    return lines;
  }
}

function terminal(columns = 40) {
  const input = new PassThrough();
  Object.defineProperties(input, {
    isTTY: { value: true, configurable: true },
    isRaw: { value: false, writable: true, configurable: true },
  });
  input.setRawMode = vi.fn(value => {
    input.isRaw = value;
    return input;
  });
  const output = new EventEmitter();
  output.isTTY = true;
  output.columns = columns;
  output.rows = 24;
  output.value = '';
  output.emulator = new MiniTerminal();
  output.write = vi.fn(chunk => {
    output.value += String(chunk);
    output.emulator.write(chunk);
    return true;
  });
  return { input, output, screen: output.emulator };
}

function type(input, value) {
  input.write(value);
}

describe('chat-style input box', () => {
  it('opens the tool transcript with Ctrl+O and toggles detail with a mouse click', async () => {
    const { input, output } = terminal(60);
    let expanded = false;
    const getTranscript = vi.fn(options => {
      if (Number.isInteger(options.toggleLine)) expanded = !expanded;
      return expanded ? 'Tool: edit_file\n-old\n+new' : 'Tool: edit_file\n… (+2 lines)';
    });
    const pending = promptInput({ stdin: input, stdout: output, color: false, getTranscript });

    type(input, 'draft');
    type(input, '\x0f');
    expect(output.value).toContain('\x1b[?1049h');
    expect(output.value).toContain('Transcript (compact)');

    type(input, '\x1b[<0;5;1M');
    expect(output.value).toContain('-old');
    expect(getTranscript).toHaveBeenCalledWith({ expanded: false, toggleLine: 0 });

    type(input, '\x0f');
    expect(output.value).toContain('\x1b[?1049l');
    type(input, '\r');
    await expect(pending).resolves.toBe('draft');
  });

  it('opens the fully expanded transcript by clicking a card above the prompt', async () => {
    const { input, output } = terminal(60);
    const getTranscript = vi.fn(({ expanded }) => expanded
      ? 'Tool: edit_file\n-old\n+new'
      : 'Tool: edit_file\n… (+2 lines)');
    const pending = promptInput({ stdin: input, stdout: output, color: false, getTranscript });

    type(input, '\x1b[<0;5;5M');
    expect(output.value).toContain('\x1b[?1049h');
    expect(output.value).toContain('-old');
    expect(getTranscript).toHaveBeenCalledWith({ expanded: true });

    await new Promise(resolve => setTimeout(resolve, 10));
    type(input, '\x0f');
    type(input, '\r');
    await expect(pending).resolves.toBe('');
  });

  it('(a) renders Turkish/emoji input and cleans the box before transcript output', async () => {
    const { input, output, screen } = terminal(45);
    const pending = promptInput({ stdin: input, stdout: output, history: [], color: false });
    type(input, 'merhaba çğşöü 🌿');
    expect(screen.screen().join('\n')).toContain('› merhaba çğşöü 🌿');
    type(input, '\r');
    const value = await pending;
    expect(value).toBe('merhaba çğşöü 🌿');
    output.write(`You ${value}\r\n`);
    expect(screen.screen()).toEqual([`You ${value}`]);
    expect(screen.cursor).toEqual({ row: 1, col: 0 });
  });

  it('(b, j) edits graphemes and keeps the cursor in the text area', async () => {
    const { input, output, screen } = terminal(30);
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, 'ab🌿界');
    type(input, '\x1b[D\x1b[D');
    type(input, 'X');
    expect(screen.cursor.col).toBe(7);
    type(input, '\x1b[H');
    type(input, '\x1b[3~');
    type(input, '\x1b[F');
    type(input, '\x7f');
    type(input, '\r');
    await expect(pending).resolves.toBe('bX🌿');
  });

  it('(c, k) accepts explicit and bracketed paste, normalizing pasted newlines', async () => {
    const { input, output } = terminal();
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    input.emit('keypress', 'one\r\ntwo', { sequence: 'one\r\ntwo' });
    type(input, '\x1b[200~three\nfour\x1b[201~');
    type(input, '\r');
    await expect(pending).resolves.toBe('one twothree four');
    expect(output.value).toContain('\x1b[?2004h');
    expect(output.value).toContain('\x1b[?2004l');
  });

  it('(d) recalls history, restores the draft, and collapses duplicates', async () => {
    const history = ['first', 'first', 'second'];
    const { input, output } = terminal();
    const pending = promptInput({ stdin: input, stdout: output, history, color: false });
    type(input, 'draft');
    type(input, '\x1b[A');
    type(input, '\x1b[B');
    type(input, '\r');
    await expect(pending).resolves.toBe('draft');
    expect(history).toEqual(['first', 'second', 'draft']);
  });

  it('(e) grows and shrinks wrapped rows without leaving debris', async () => {
    const { input, output, screen } = terminal(20);
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, 'abcdefghijklmnop');
    expect(screen.screen()).toHaveLength(4);
    type(input, '\x7f\x7f\x7f');
    expect(screen.screen()).toHaveLength(3);
    expect(screen.screen().join('')).not.toContain('nop');
    type(input, '\r');
    await pending;
  });

  it('(f, g, k) rejects SIGINT and restores raw, pause, listeners, and cursor state', async () => {
    const { input, output, screen } = terminal();
    getKeypressTransport(input);
    const baseline = {
      raw: input.isRaw,
      paused: input.isPaused(),
      keypress: input.listeners('keypress'),
      data: input.listeners('data'),
      resize: output.listeners('resize'),
    };
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, '\x03');
    await expect(pending).rejects.toMatchObject({ code: 'SIGINT' });
    expect(input.isRaw).toBe(baseline.raw);
    expect(input.isPaused()).toBe(baseline.paused);
    expect(input.listeners('keypress')).toEqual(baseline.keypress);
    expect(input.listeners('data')).toEqual(baseline.data);
    expect(output.listeners('resize')).toEqual(baseline.resize);
    expect(screen.visible).toBe(true);
    expect(output.value).toContain('\x1b[?2004l');
  });

  it('(g) funnels a render failure through the same restoration path', async () => {
    const { input, output } = terminal();
    getKeypressTransport(input);
    const baselineData = input.listeners('data');
    const originalWrite = output.write;
    let fail = false;
    output.write = vi.fn(chunk => {
      if (fail && String(chunk).includes('boom')) throw new Error('render failed');
      return originalWrite(chunk);
    });
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    fail = true;
    input.emit('keypress', 'boom', { sequence: 'boom' });
    await expect(pending).rejects.toThrow('render failed');
    expect(input.isRaw).toBe(false);
    expect(input.isPaused()).toBe(true);
    expect(input.listeners('data')).toEqual(baselineData);
    expect(output.listenerCount('resize')).toBe(0);
  });

  it('(h) gates every TTY combination, width, override, and fallback construction', async () => {
    for (const stdinTTY of [false, true]) {
      for (const stdoutTTY of [false, true]) {
        expect(canUseInputBox({
          stdin: { isTTY: stdinTTY },
          stdout: { isTTY: stdoutTTY, columns: 80 },
          env: {},
        })).toBe(stdinTTY && stdoutTTY);
      }
    }
    expect(canUseInputBox({
      stdin: { isTTY: true },
      stdout: { isTTY: true, columns: 19 },
      env: {},
    })).toBe(false);
    expect(canUseInputBox({
      stdin: { isTTY: true },
      stdout: { isTTY: true, columns: 80 },
      env: { NATURECO_PLAIN_INPUT: '1' },
    })).toBe(false);

    const readlineModule = { createInterface: vi.fn(() => ({
      question: (_prompt, callback) => callback('fallback'),
      close: vi.fn(),
    })) };
    const prompt = vi.fn();
    const session = codeV5._presentation.createCodeInputSession({
      stdin: { isTTY: false },
      stdout: { isTTY: true, columns: 80 },
      env: {},
      readlineModule,
      prompt,
    });
    await expect(session.read()).resolves.toBe('fallback');
    expect(readlineModule.createInterface).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
    session.close();
  });

  it('(i) switches 25 -> 10 -> 25 with a long buffer intact', async () => {
    const { input, output, screen } = terminal(25);
    const value = 'this is much longer than ten';
    const pending = promptInput({ stdin: input, stdout: output, color: false });
    type(input, value);
    output.columns = 10;
    output.emit('resize');
    expect(screen.screen()).toHaveLength(1);
    expect(screen.screen()[0].startsWith('› ')).toBe(true);
    expect(tui.stringWidth(screen.screen()[0])).toBeLessThanOrEqual(9);
    output.columns = 25;
    output.emit('resize');
    expect(screen.screen()[0]).toContain('╭');
    type(input, '\r');
    await expect(pending).resolves.toBe(value);
  });

  it('(j) pure frame maps middle, wrapped, emoji, and CJK cursor positions', () => {
    const model = createTextModel();
    insertIntoModel(model, 'ab🌿界cd');
    model.cursor = 4;
    const frame = renderFrame({ model, columns: 20, color: false });
    expect(frame.mode).toBe('box');
    expect(frame.cursorRow).toBe(1);
    expect(frame.cursorCol).toBe(10);

    insertIntoModel(model, 'abcdefghijklmnop');
    model.cursor = model.graphemes.length;
    const wrapped = renderFrame({ model, columns: 20, color: false });
    expect(wrapped.cursorRow).toBeGreaterThan(1);
    expect(wrapped.cursorCol).toBeLessThan(wrapped.width - 1);
  });

  it('(l) hands real bytes to the next owner and does not grow listeners over cycles', async () => {
    const { input, output } = terminal();
    const transport = getKeypressTransport(input);
    const baseline = {
      keypress: input.listenerCount('keypress'),
      data: input.listenerCount('data'),
    };
    for (let cycle = 0; cycle < 3; cycle++) {
      const pending = promptInput({ stdin: input, stdout: output, color: false });
      type(input, `box${cycle}\r`);
      await pending;
      let received = '';
      const release = transport.acquire(text => { received += text; });
      type(input, 'D');
      expect(received).toBe('D');
      release();
      expect(input.listenerCount('keypress')).toBe(baseline.keypress);
      expect(input.listenerCount('data')).toBe(baseline.data);
    }
    transport.dispose();
  });

  it('(g2) a submitted child session disposes and exits without leaked handles', async () => {
    const script = `
      const { PassThrough } = require('stream');
      const { promptInput, getKeypressTransport } = require('./src/utils/input-box');
      const input = new PassThrough();
      Object.defineProperties(input, {
        isTTY: { value: true },
        isRaw: { value: false, writable: true }
      });
      input.setRawMode = value => { input.isRaw = value; };
      const output = new (require('events').EventEmitter)();
      output.isTTY = true; output.columns = 30; output.write = () => true;
      const transport = getKeypressTransport(input);
      promptInput({ stdin: input, stdout: output, color: false }).then(() => {
        transport.dispose();
        process.stdout.write('done');
      });
      input.write('exit\\r');
    `;
    const child = spawn(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toBe('done');
  });
});
