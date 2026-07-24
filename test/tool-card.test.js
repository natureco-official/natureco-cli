import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');
const {
  normalizeResult,
  renderToolCall,
} = requireCjs('../src/utils/tool-card.js');

const plain = value => tui.stripAnsi(value);
let saved;

beforeEach(() => {
  saved = {
    color: tui.CAPS.color,
    trueColor: tui.CAPS.trueColor,
    width: tui.CAPS.width,
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
  tui.CAPS.width = saved.width;
  if (saved.noColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = saved.noColor;
  if (saved.forceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = saved.forceColor;
});

describe('Rock C unified tool-card renderer', () => {
  it('(a) renders a read_file name and successful status glyph', () => {
    const output = renderToolCall(
      'read_file',
      { path: '/home/alice/project/readme.md' },
      { result: 'contents' },
      { lang: 'en' },
    );
    expect(plain(output)).toContain('Tool: read_file');
    expect(plain(output)).toContain('✓');
  });

  it('(b) normalizes every executeTool result shape without throwing', () => {
    const fixtures = [
      'direct string',
      { success: true, output: 'direct object' },
      { result: 'wrapped result' },
      { error: 'wrapped error' },
      { success: false, error: 'explicit failure' },
    ];
    for (const fixture of fixtures) {
      expect(() => normalizeResult(fixture)).not.toThrow();
      expect(() => renderToolCall('read_file', { path: 'file.txt' }, fixture)).not.toThrow();
    }
    expect(normalizeResult(fixtures[0]).success).toBe(true);
    expect(normalizeResult(fixtures[3]).success).toBe(false);
    expect(normalizeResult(fixtures[4]).success).toBe(false);
  });

  it('(c) routes edit snapshots through a valid, correctly colored unified diff', () => {
    const output = renderToolCall(
      'edit_file',
      { path: 'sample.txt', old_string: 'b', new_string: 'c' },
      { success: true, replacements: 1 },
      { before: 'a\nb\n', after: 'a\nc\n', lang: 'en', maxLines: 30 },
    );
    const stripped = plain(output);
    const content = stripped.split('\n')
      .map(line => line.replace(/^│ /, '').replace(/\s+│$/, ''))
      .filter(line =>
        (line.startsWith('+') && !line.startsWith('+++')) ||
        (line.startsWith('-') && !line.startsWith('---')));

    expect(stripped).toContain('@@');
    expect(content).toEqual(['-b', '+c']);
    expect(output).toContain(`${tui.fg(tui.PALETTE.danger)}-b\x1b[0m`);
    expect(output).toContain(`${tui.fg(tui.PALETTE.success)}+c\x1b[0m`);
    expect(output.endsWith('\x1b[')).toBe(false);
  });

  it('(d) caps long output with a localized +N footer and terminal-width lines', () => {
    const output = renderToolCall(
      'read_file',
      { path: 'long.txt' },
      { result: Array.from({ length: 30 }, (_, i) => `line-${i}-${'x'.repeat(80)}`).join('\n') },
      { width: 42, maxLines: 6, lang: 'en', color: false },
    );
    expect(output).toMatch(/… \(\+\d+ lines\)/);
    expect(output.split('\n').every(line => tui.stringWidth(line) <= 42)).toBe(true);
  });

  it('(e) redacts args and diff bodies, sanitizes controls, and suppresses sensitive diffs', () => {
    const home = 'C:\\Users\\alice';
    const token = 'sk-supersecret123456';
    const output = renderToolCall(
      'edit_file',
      { path: `${home}\\project\\a.txt`, old_string: token, new_string: `${token}-new` },
      { result: `saved ${home}\x1b[31m token=${token}` },
      {
        before: `owner=${home}\ntoken=${token}\n`,
        after: `owner=${home}\\next\ntoken=${token}-new\n`,
        home,
        lang: 'en',
        maxLines: 30,
      },
    );
    const sensitive = renderToolCall(
      'edit_file',
      { path: `${home}\\project\\.env`, old_string: token, new_string: 'replacement' },
      { success: true },
      { before: `TOKEN=${token}\n`, after: 'TOKEN=replacement\n', home, lang: 'en' },
    );

    expect(plain(output)).not.toContain(home);
    expect(plain(output)).not.toContain(token);
    expect(plain(output)).not.toContain('[31m');
    expect(plain(output)).toContain('~\\project\\a.txt');
    expect(plain(sensitive)).toContain('diff suppressed');
    expect(plain(sensitive)).not.toContain('TOKEN=');
    expect(plain(sensitive)).not.toContain('@@');
  });

  it('(f) Turkish and English cards differ only in localized labels', () => {
    const args = { path: 'sample.txt' };
    const tr = plain(renderToolCall('read_file', args, { result: 'ok' }, { lang: 'tr', color: false }));
    const en = plain(renderToolCall('read_file', args, { result: 'ok' }, { lang: 'en', color: false }));
    const normalizeLabels = value => value
      .replace('Araç', 'Tool')
      .replace('Argümanlar', 'Args')
      .replace('Sonuç', 'Result')
      .split('\n')
      .map(line => line
        .replace(/─+(?=╮$)/, '─')
        .replace(/\s+(?=│$)/, ' '))
      .join('\n');

    expect(tr).not.toBe(en);
    expect(normalizeLabels(tr)).toBe(normalizeLabels(en));
  });
});
