import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');
const { renderMarkdown, highlightCode, renderDiff } = requireCjs('../src/utils/render.js');

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const ansiCount = value => (String(value).match(ANSI_RE) || []).length;
const withoutAnsi = value => tui.stripAnsi(value);

let saved;

beforeEach(() => {
  saved = {
    color: tui.CAPS.color,
    trueColor: tui.CAPS.trueColor,
    noColor: process.env.NO_COLOR,
    forceColor: process.env.FORCE_COLOR,
  };
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  tui.CAPS.color = true;
  tui.CAPS.trueColor = true;
  tui.CAPS.width = 80;
});

afterEach(() => {
  tui.CAPS.color = saved.color;
  tui.CAPS.trueColor = saved.trueColor;
  if (saved.noColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = saved.noColor;
  if (saved.forceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = saved.forceColor;
});

describe('Rock A terminal render engine', () => {
  it('(a) renders heading, bold, and inline code with ANSI', () => {
    const output = renderMarkdown('# Heading\n\nA **bold** and `code` value.');
    expect(withoutAnsi(output)).toContain('Heading');
    expect(withoutAnsi(output)).toContain('A bold and code value.');
    expect(output).toMatch(/\x1b\[/);
    expect(output).toContain('\x1b[1m');
    expect(ansiCount(output)).toBeGreaterThanOrEqual(6);
  });

  it('(b) highlights a fenced block without recoloring comment markers inside strings', () => {
    const output = renderMarkdown([
      '```js',
      'const url = "https://example.test//not-comment";',
      'const template = `/* still a string */`;',
      '// actual comment',
      '```',
    ].join('\n'));
    const direct = highlightCode('"// string" // comment', 'js');

    expect(withoutAnsi(output)).toContain('const url = "https://example.test//not-comment";');
    expect(output).toContain(tui.fg(tui.PALETTE.success) + '"https://example.test//not-comment"');
    expect(output).toContain(tui.fg(tui.PALETTE.success) + '`/* still a string */`');
    expect(output).toContain(tui.fg(tui.PALETTE.muted) + '\x1b[2m// actual comment');
    expect(direct).toContain(tui.fg(tui.PALETTE.success) + '"// string"');
    expect(direct).toContain(tui.fg(tui.PALETTE.muted) + '\x1b[2m// comment');
  });

  it('(c) emits a valid unified diff with correctly colored, balanced content lines', () => {
    const output = renderDiff('a\nb\n', 'a\nc\n', { path: 'sample.txt' });
    const plain = withoutAnsi(output);
    const contentLines = plain.split('\n').filter(line =>
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---')));

    expect(plain).toContain('@@');
    expect(plain).toContain(' a');
    expect(contentLines).toEqual(['-b', '+c']);
    expect(output).toContain(`${tui.fg(tui.PALETTE.danger)}-b\x1b[0m`);
    expect(output).toContain(`${tui.fg(tui.PALETTE.success)}+c\x1b[0m`);
    expect((output.match(/\x1b\[0m/g) || []).length).toBeGreaterThanOrEqual(ansiCount(output) / 3);
    expect(output.endsWith('\x1b[')).toBe(false);
  });

  it('(d) emits zero ANSI when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    expect(renderMarkdown('# Heading **bold** `code`')).not.toMatch(/\x1b\[/);
    expect(highlightCode('const x = "value"; // comment', 'js')).not.toMatch(/\x1b\[/);
    expect(renderDiff('old\n', 'new\n', { path: 'plain.txt' })).not.toMatch(/\x1b\[/);
  });

  it('(e) sanitizes raw terminal escapes and caps a 2MB input promptly and safely', () => {
    const hostile = '```js\nconst safe = "\\x1b[31mred";\n```'.replace('\\x1b', '\x1b');
    const fenced = renderMarkdown(hostile, { maxColumns: 40, maxBytes: 4096 });
    const large = renderMarkdown('x'.repeat(2 * 1024 * 1024), {
      maxInputBytes: 64 * 1024,
      maxBytes: 8192,
      maxColumns: 32,
    });

    expect(withoutAnsi(fenced)).toContain('const safe = "red";');
    expect(withoutAnsi(fenced)).not.toContain('[31m');
    expect(Buffer.byteLength(large)).toBeLessThanOrEqual(8192);
    expect(withoutAnsi(large).split('\n').every(line => line.length <= 32)).toBe(true);
    expect(large.endsWith('\x1b[')).toBe(false);
  });

  it('(f) degrades HTML, tables, and task lists to sanitized plain text without dropping them', () => {
    const markdown = [
      '<section>unsafe\x1b[31m html</section>',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| leaf | green |',
      '',
      '- [x] rendered task',
      '- [ ] pending task',
    ].join('\n');

    expect(() => renderMarkdown(markdown)).not.toThrow();
    const plain = withoutAnsi(renderMarkdown(markdown));
    expect(plain).toContain('<section>unsafe html</section>');
    expect(plain).toContain('| Name | Value |');
    expect(plain).toContain('| leaf | green |');
    expect(plain).toContain('- [x] rendered task');
    expect(plain).toContain('- [ ] pending task');
    expect(plain).not.toContain('\x1b');
  });
});

