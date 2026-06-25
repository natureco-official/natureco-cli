/**
 * paste-safe-input — uzun/çok satırlı yapıştırmaların erken submit edilmesini
 * önleyen bracketed-paste proxy'sinin testleri.
 */
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'stream';
import readline from 'readline';
import {
  createPasteSafeInput,
  restoreNewlines,
  NEWLINE_PLACEHOLDER,
} from '../../src/utils/paste-safe-input.js';

function collectLines(src) {
  return new Promise((resolve) => {
    const proxy = createPasteSafeInput(src);
    const rl = readline.createInterface({ input: proxy, terminal: false });
    const lines = [];
    rl.on('line', (l) => lines.push(restoreNewlines(l)));
    rl.on('close', () => resolve(lines));
  });
}

describe('paste-safe-input', () => {
  it('bracketed paste içindeki çok satırlı metni TEK bir line event olarak verir', async () => {
    const src = new PassThrough();
    const promise = collectLines(src);
    src.write('\x1b[200~satır1\nsatır2\nsatır3\x1b[201~');
    src.write('\n'); // gerçek Enter
    src.end();
    const lines = await promise;
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('satır1\nsatır2\nsatır3');
  });

  it('paste markerı olmadan normal yazılan satırlar eskisi gibi ayrı ayrı submit edilir', async () => {
    const src = new PassThrough();
    const promise = collectLines(src);
    src.write('merhaba\n');
    src.write('nasılsın\n');
    src.end();
    const lines = await promise;
    expect(lines).toEqual(['merhaba', 'nasılsın']);
  });

  it('paste markerı chunk sınırına bölünse bile doğru ayrıştırılır', async () => {
    const src = new PassThrough();
    const promise = collectLines(src);
    const full = '\x1b[200~satır A\nsatır B\x1b[201~\n';
    // Marker'ı ortadan ikiye bölerek gönder
    const mid = Math.floor(full.length / 2);
    src.write(full.slice(0, mid));
    setTimeout(() => {
      src.write(full.slice(mid));
      src.end();
    }, 5);
    const lines = await promise;
    expect(lines).toEqual(['satır A\nsatır B']);
  });

  it('paste içindeki satır sonları sade metinle çarpışmayan bir placeholder kullanır', () => {
    expect(NEWLINE_PLACEHOLDER).not.toBe('\n');
    expect(restoreNewlines(`a${NEWLINE_PLACEHOLDER}b`)).toBe('a\nb');
  });

  it('tek tuş yazımında (1 karakterlik chunklar) hiçbir karakter geciktirilmez', async () => {
    const src = new PassThrough();
    const seen = [];
    const proxy = createPasteSafeInput(src);
    proxy.on('data', (d) => seen.push(d.toString('utf8')));
    for (const ch of 'merhaba') src.write(ch);
    src.end();
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.join('')).toBe('merhaba');
  });
});
