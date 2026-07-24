import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { createStreamWriter } = requireCjs('../src/utils/stream-render.js');
const { renderMarkdown } = requireCjs('../src/utils/render.js');
const tui = requireCjs('../src/utils/tui.js');

function sink(isTTY = true) {
  return {
    isTTY,
    value: '',
    write(chunk) { this.value += String(chunk); },
  };
}

function terminalText(value) {
  const plain = value.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = [''];
  let row = 0;
  let column = 0;
  for (let index = 0; index < plain.length;) {
    if (plain.startsWith('\x1b[2K', index)) {
      lines[row] = '';
      column = 0;
      index += 4;
    } else if (plain.startsWith('\x1b[1A', index)) {
      row = Math.max(0, row - 1);
      column = 0;
      index += 4;
    } else if (plain[index] === '\r') {
      column = 0;
      index++;
    } else if (plain[index] === '\n') {
      row++;
      if (lines[row] === undefined) lines[row] = '';
      column = 0;
      index++;
    } else {
      const character = plain[index++];
      lines[row] = lines[row].slice(0, column) + character + lines[row].slice(column + 1);
      column++;
    }
  }
  while (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}

let saved;
beforeEach(() => {
  saved = {
    noColor: process.env.NO_COLOR,
    forceColor: process.env.FORCE_COLOR,
    color: tui.CAPS.color,
    trueColor: tui.CAPS.trueColor,
  };
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  tui.CAPS.color = true;
  tui.CAPS.trueColor = true;
});

afterEach(() => {
  if (saved.noColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = saved.noColor;
  if (saved.forceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = saved.forceColor;
  tui.CAPS.color = saved.color;
  tui.CAPS.trueColor = saved.trueColor;
});

describe('stream presentation writer', () => {
  it('(a,d) commits incrementally and retains byte-identical raw deltas', () => {
    const output = sink();
    const writer = createStreamWriter({ output });
    const deltas = ['First block.\n\n', 'Second block.\n\n', 'Third block.'];
    for (const delta of deltas) writer.push(delta);
    expect(writer.commitCount).toBeGreaterThanOrEqual(2);
    expect(writer.getRaw()).toBe(deltas.join(''));
    writer.end();
    expect(Buffer.from(writer.getRaw())).toEqual(Buffer.from(deltas.join('')));
  });

  it('(b) holds a split JavaScript fence until its close and then commits highlighted code', () => {
    const output = sink();
    const writer = createStreamWriter({ output });
    writer.push('```j');
    writer.push('s\nconst answer = 4');
    expect(writer.commitCount).toBe(0);
    writer.push('2;\n``');
    expect(writer.commitCount).toBe(0);
    writer.push('`\n');
    expect(writer.commitCount).toBe(1);
    expect(output.value).toMatch(/\x1b\[/);
    writer.end();
    expect(terminalText(output.value)).toBe(tui.stripAnsi(renderMarkdown(writer.getRaw())));
  });

  it('(c) matches full markdown rendering across adversarial one-byte boundaries', () => {
    const full = [
      'Setext heading',
      '==============',
      '',
      '- one',
      '- two with *emphasis*',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '> quoted **strong**',
      '',
      '```js',
      'const x = `tick`;',
      '```',
      '',
      'unterminated *inline delimiter',
      '',
      '```python',
      'print("unterminated fence")',
    ].join('\n');
    const output = sink();
    const writer = createStreamWriter({ output });
    for (const byte of full) writer.push(byte);
    writer.end();
    expect(terminalText(output.value)).toBe(tui.stripAnsi(renderMarkdown(full)));
    expect(writer.getRaw()).toBe(full);
  });

  it('(e) streams raw with no ANSI or repaint for NO_COLOR and non-TTY output', () => {
    for (const mode of ['no-color', 'non-tty']) {
      if (mode === 'no-color') process.env.NO_COLOR = '1';
      else delete process.env.NO_COLOR;
      const output = sink(mode !== 'non-tty');
      const writer = createStreamWriter({ output });
      writer.push('# title\n\n');
      writer.push('**raw**');
      writer.end();
      expect(output.value).toBe('# title\n\n**raw**');
      expect(output.value).not.toMatch(/\x1b\[/);
      expect(output.value).not.toContain('\r');
    }
  });
});
