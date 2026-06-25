/**
 * paste-safe-input — uzun/çok satırlı yapıştırmaların erken submit edilmesini
 * önleyen bracketed-paste proxy'sinin testleri.
 */
import { describe, it, expect } from 'vitest';
import { PassThrough, Writable } from 'stream';
import readline from 'readline';
import {
  createPasteSafeInput,
  createOutputFilter,
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

describe('createOutputFilter', () => {
  function collectOutput(chunks) {
    const out = new PassThrough();
    const filter = createOutputFilter(out);
    const collected = [];
    out.on('data', (d) => collected.push(d.toString('utf8')));
    for (const ch of chunks) filter.write(ch);
    return collected.join('');
  }

  it('normal yazıda placeholder olmayan karakterler aynen geçer', () => {
    const result = collectOutput(['m', 'e', 'r', 'h', 'a', 'b', 'a']);
    expect(result).toBe('merhaba');
  });

  it('placeholder karakterleri terminalde görünmez, onun yerine \\n geçer', () => {
    // Readline eko simülasyonu: placeholder karakterleri tek tek yazılır
    const phChars = NEWLINE_PLACEHOLDER.split('');
    // Arasına normal metin koy: line1 + placeholder + line2
    const chunks = [
      ...'line1'.split(''),
      ...phChars,
      ...'line2'.split(''),
    ];
    const result = collectOutput(chunks);
    expect(result).toBe('line1\nline2');
  });

  it('kısmi placeholder (chunk sınırında bölünmüş) doğru işlenir', () => {
    // Placeholder'ı ikiye bölerek yaz
    const mid = Math.floor(NEWLINE_PLACEHOLDER.length / 2);
    const part1 = NEWLINE_PLACEHOLDER.slice(0, mid);
    const part2 = NEWLINE_PLACEHOLDER.slice(mid);

    const out = new PassThrough();
    const filter = createOutputFilter(out);
    const collected = [];
    out.on('data', (d) => collected.push(d.toString('utf8')));

    filter.write('a');
    filter.write(part1);
    filter.write(part2);
    filter.write('b');

    expect(collected.join('')).toBe('a\nb');
  });

  it('placeholder olmayan kısmi dize buffer\'da bekletilmez — hemen yazılır', () => {
    // Placeholder başlangıcı gibi görünen ama olmayan dize
    // \u2424 tek başına placeholder başlangıcıdır ama devamı gelmezse yazılmalı
    const out = new PassThrough();
    const filter = createOutputFilter(out);
    const collected = [];
    out.on('data', (d) => collected.push(d.toString('utf8')));

    filter.write('\u2424'); // placeholder başlangıcı
    filter.write('x'); // eşleşmez, \u2424 deflush olmalı

    expect(collected.join('')).toBe('\u2424x');
  });

  it('gerçek terminal senaryosu: pasted metin output\'ta placeholder içermez', async () => {
    // Çok satırlı paste + Enter simülasyonu
    const src = new PassThrough();
    const out = new PassThrough();
    const filter = createOutputFilter(out);
    const proxy = createPasteSafeInput(src);

    const rl = readline.createInterface({
      input: proxy,
      output: filter,
      terminal: true,
      prompt: '',
    });

    // Çıktıyı topla
    const outputChunks = [];
    out.on('data', (d) => outputChunks.push(d.toString('utf8')));

    // 'line' event'lerini topla
    const lines = [];
    rl.on('line', (l) => lines.push(restoreNewlines(l)));

    // Çok satırlı paste (bracket marker'sız, terminal-agnostik)
    // Son satırda \n yok — gerçek Enter ayrı bir chunk
    src.write('line1\nline2\nline3');
    src.write('\r'); // gerçek Enter
    src.end();

    await new Promise((r) => setTimeout(r, 10));
    rl.close();

    const output = outputChunks.join('');
    // Output'ta NEWLINE_PLACEHOLDER literal geçmemeli
    expect(output).not.toContain(NEWLINE_PLACEHOLDER);
    // Output'ta "LINEBREAK" alt dizesi geçmemeli
    expect(output).not.toContain('LINEBREAK');
    // line event'leri doğru olmalı
    expect(lines).toEqual(['line1\nline2\nline3']);
  });
});
