'use strict';

const { marked } = require('marked');
const diff = require('diff');
const stringWidth = require('string-width');
const {
  styled,
  C,
  stripAnsi,
  CAPS,
  PALETTE,
  STYLE,
} = require('./tui');

const DEFAULT_MAX_INPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_COLUMNS = 120;
const PALETTE_256 = {
  primary: 41,
  secondary: 39,
  accent: 214,
  success: 36,
  danger: 196,
  muted: 244,
  bgAlt: 236,
};
/* eslint-disable no-control-regex -- matching terminal control bytes is the sanitizer's purpose */
const ANSI_SGR_RE = /^\x1b\[[0-9;]*m/;
const CONTROL_SEQUENCE_RE =
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[P^_X][\s\S]*?(?:\x1b\\|$)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[ -/]*[0-~]|\x9d[^\x07\x9c]*(?:\x07|\x9c)?|[\x90\x98\x9e\x9f][\s\S]*?(?:\x9c|$)|\x9b[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHARACTER_RE = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;
/* eslint-enable no-control-regex */

function safeString(value) {
  try {
    return String(value ?? '');
  } catch {
    return '';
  }
}

function sanitize(value) {
  return safeString(value)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_SEQUENCE_RE, '')
    .replace(CONTROL_CHARACTER_RE, '');
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function capPlainBytes(value, maximum) {
  const text = String(value);
  if (Buffer.byteLength(text, 'utf8') <= maximum) return text;

  const suffix = '…';
  const budget = Math.max(0, maximum - Buffer.byteLength(suffix));
  let result = '';
  let bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > budget) break;
    result += character;
    bytes += size;
  }
  return result + (maximum >= Buffer.byteLength(suffix) ? suffix : '');
}

function inputText(value, opts = {}) {
  const maximum = positiveInt(opts.maxInputBytes, DEFAULT_MAX_INPUT_BYTES);
  return capPlainBytes(sanitize(value), maximum);
}

function colorsDisabled(opts = {}) {
  return opts.color === false ||
    process.env.NO_COLOR !== undefined ||
    process.env.FORCE_COLOR === '0' ||
    (!CAPS.color && !CAPS.trueColor);
}

function paletteColor(role) {
  return CAPS.trueColor ? PALETTE[role] : PALETTE_256[role];
}

function withoutTerminalColor(opts, callback) {
  if (!colorsDisabled(opts)) return callback();

  const previousColor = CAPS.color;
  const previousTrueColor = CAPS.trueColor;
  CAPS.color = false;
  CAPS.trueColor = false;
  try {
    return stripAnsi(callback());
  } finally {
    CAPS.color = previousColor;
    CAPS.trueColor = previousTrueColor;
  }
}

function segmentGraphemes(text) {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text), item => item.segment);
}

function outputChunks(value, maximumColumns) {
  const source = String(value);
  const chunks = [];
  let index = 0;
  let column = 0;
  let styledLine = false;

  function append(text, isAnsi = false) {
    chunks.push({ text, isAnsi });
  }

  while (index < source.length) {
    if (source[index] === '\x1b') {
      const match = source.slice(index).match(ANSI_SGR_RE);
      if (match) {
        append(match[0], true);
        styledLine = match[0] !== STYLE.reset && match[0] !== '\x1b[0m';
        index += match[0].length;
        continue;
      }
      index += 1;
      continue;
    }

    const nextAnsi = source.indexOf('\x1b', index);
    const end = nextAnsi === -1 ? source.length : nextAnsi;
    const plain = source.slice(index, end);
    const parts = plain.split(/(\n)/);

    for (const part of parts) {
      if (!part) continue;
      if (part === '\n') {
        if (styledLine) append(STYLE.reset, true);
        append('\n');
        column = 0;
        styledLine = false;
        continue;
      }

      for (const grapheme of segmentGraphemes(part)) {
        const width = grapheme === '\t'
          ? 4 - (column % 4)
          : stringWidth(grapheme);

        if (column > 0 && column + width > maximumColumns) {
          if (styledLine) append(STYLE.reset, true);
          append('\n');
          column = 0;
          styledLine = false;
        }

        if (width > maximumColumns) {
          append('?');
          column += 1;
        } else {
          append(grapheme);
          column += width;
        }
      }
    }
    index = end;
  }
  return chunks;
}

function capOutput(value, opts = {}) {
  const maximumBytes = positiveInt(opts.maxBytes, DEFAULT_MAX_OUTPUT_BYTES);
  const maximumColumns = positiveInt(
    opts.maxColumns || opts.width,
    Math.max(1, CAPS.width || DEFAULT_MAX_COLUMNS),
  );
  const chunks = outputChunks(value, maximumColumns);
  let output = chunks.map(chunk => chunk.text).join('');
  if (Buffer.byteLength(output, 'utf8') <= maximumBytes) return output;

  const suffix = '…';
  const reset = colorsDisabled(opts) ? '' : STYLE.reset;
  const reserve = Buffer.byteLength(suffix + reset);
  let bytes = 0;
  const kept = [];
  for (const chunk of chunks) {
    const size = Buffer.byteLength(chunk.text);
    if (bytes + size > Math.max(0, maximumBytes - reserve)) break;
    kept.push(chunk.text);
    bytes += size;
  }
  output = kept.join('') + suffix + reset;
  while (Buffer.byteLength(output) > maximumBytes && kept.length) {
    kept.pop();
    output = kept.join('') + suffix + reset;
  }
  return Buffer.byteLength(output) <= maximumBytes ? output : '';
}

function inlineFallback(token) {
  if (token == null) return '';
  if (typeof token === 'string') return sanitize(token);
  return sanitize(token.raw ?? token.text ?? '');
}

function renderInline(tokens) {
  if (!Array.isArray(tokens)) return sanitize(tokens ?? '');
  return tokens.map(token => {
    try {
      switch (token.type) {
        case 'text':
        case 'escape':
          return token.tokens ? renderInline(token.tokens) : sanitize(token.text);
        case 'strong':
          return styled(renderInline(token.tokens), { bold: true });
        case 'em':
          return styled(renderInline(token.tokens), { italic: true });
        case 'del':
          return styled(renderInline(token.tokens), { dim: true });
        case 'codespan':
          return styled(sanitize(token.text), {
            color: paletteColor('accent'),
            bg: paletteColor('bgAlt'),
          });
        case 'link': {
          const label = styled(renderInline(token.tokens), {
            color: paletteColor('secondary'),
            underline: true,
          });
          return `${label}${C.dim(` (${sanitize(token.href)})`)}`;
        }
        case 'image':
          return `${sanitize(token.text || token.href)}${C.dim(` (${sanitize(token.href)})`)}`;
        case 'br':
          return '\n';
        default:
          return inlineFallback(token);
      }
    } catch {
      return inlineFallback(token);
    }
  }).join('');
}

function plainToken(token) {
  return sanitize(token?.raw ?? token?.text ?? '');
}

function renderList(token, opts, depth) {
  if (!Array.isArray(token.items)) return plainToken(token);
  if (token.items.some(item => item.task)) return plainToken(token);

  const start = Number.isFinite(token.start) ? token.start : 1;
  const indent = '  '.repeat(depth);
  const lines = [];

  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${start + index}.` : '•';
    const children = Array.isArray(item.tokens) ? item.tokens : [];
    const first = children[0];
    const body = first && (first.type === 'text' || first.type === 'paragraph')
      ? renderInline(first.tokens || [{ type: 'text', text: first.text }])
      : plainToken(item).replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '');
    const bodyLines = body.split('\n');
    lines.push(`${indent}${styled(marker, { color: paletteColor('primary'), bold: true })} ${bodyLines.shift() || ''}`);
    for (const line of bodyLines) lines.push(`${indent}  ${line}`);

    for (const child of children.slice(first ? 1 : 0)) {
      if (child.type === 'list') {
        lines.push(renderList(child, opts, depth + 1));
      } else if (child.type !== 'space') {
        const rendered = renderBlock(child, opts, depth + 1);
        if (rendered) {
          lines.push(rendered.split('\n').map(line => `${indent}  ${line}`).join('\n'));
        }
      }
    }
  });
  return lines.join('\n');
}

function renderBlock(token, opts, depth = 0) {
  try {
    switch (token.type) {
      case 'space':
        return '';
      case 'heading':
        return styled(renderInline(token.tokens), {
          color: paletteColor('primary'),
          bold: true,
        });
      case 'paragraph':
        return renderInline(token.tokens || [{ type: 'text', text: token.text }]);
      case 'text':
        return token.tokens ? renderInline(token.tokens) : sanitize(token.text);
      case 'hr':
        return C.muted('─'.repeat(Math.min(40, positiveInt(opts.maxColumns || opts.width, 40))));
      case 'blockquote': {
        const body = renderBlocks(token.tokens, opts, depth);
        return body.split('\n').map(line => `${C.muted('│')} ${line}`).join('\n');
      }
      case 'list':
        return renderList(token, opts, depth);
      case 'code':
        if (token.codeBlockStyle === 'indented') return plainToken(token);
        return highlightCode(token.text, token.lang || '', opts);
      case 'html':
      case 'table':
        return plainToken(token);
      default:
        return plainToken(token);
    }
  } catch {
    return plainToken(token);
  }
}

function renderBlocks(tokens, opts, depth = 0) {
  return (Array.isArray(tokens) ? tokens : [])
    .map(token => renderBlock(token, opts, depth))
    .filter(value => value !== '')
    .join('\n\n');
}

function renderMarkdown(text, opts = {}) {
  return withoutTerminalColor(opts, () => {
    const clean = inputText(text, opts);
    try {
      const tokens = marked.lexer(clean, {
        gfm: true,
        breaks: false,
        pedantic: false,
      });
      return capOutput(renderBlocks(tokens, opts), opts);
    } catch {
      return capOutput(clean, opts);
    }
  });
}

const LANGUAGE_ALIASES = {
  javascript: 'js',
  jsx: 'js',
  typescript: 'ts',
  tsx: 'ts',
  shell: 'bash',
  sh: 'bash',
  zsh: 'bash',
  py: 'python',
};

const KEYWORDS = {
  js: new Set('as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch throw try typeof var void while with yield true false null undefined'.split(' ')),
  ts: new Set('abstract any as asserts async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly require return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield'.split(' ')),
  json: new Set(['true', 'false', 'null']),
  bash: new Set('case do done elif else esac fi for function if in select then time until while true false'.split(' ')),
  python: new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'.split(' ')),
};

function languageName(language) {
  const raw = sanitize(language).trim().toLowerCase().split(/\s+/)[0];
  return LANGUAGE_ALIASES[raw] || raw || 'generic';
}

function pushSegment(segments, role, text) {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.role === role) previous.text += text;
  else segments.push({ role, text });
}

function readQuoted(source, start, quote, language) {
  const triple = language === 'python' && source.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  let index = start + delimiter.length;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += Math.min(2, source.length - index);
      continue;
    }
    if (source.slice(index, index + delimiter.length) === delimiter) {
      index += delimiter.length;
      break;
    }
    index += 1;
  }
  return index;
}

function tokenizeCode(source, language) {
  const segments = [];
  const keywords = KEYWORDS[language] || new Set();
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const pair = source.slice(index, index + 2);

    if ((language === 'js' || language === 'ts') && pair === '//') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      pushSegment(segments, 'comment', source.slice(index, stop));
      index = stop;
      continue;
    }
    if ((language === 'js' || language === 'ts') && pair === '/*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      pushSegment(segments, 'comment', source.slice(index, stop));
      index = stop;
      continue;
    }
    if ((language === 'python' || language === 'bash') && character === '#') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      pushSegment(segments, 'comment', source.slice(index, stop));
      index = stop;
      continue;
    }
    if (character === '"' || character === "'" ||
        ((language === 'js' || language === 'ts' || language === 'bash') && character === '`')) {
      const stop = readQuoted(source, index, character, language);
      pushSegment(segments, 'string', source.slice(index, stop));
      index = stop;
      continue;
    }

    const identifier = source.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (identifier) {
      pushSegment(segments, keywords.has(identifier[0]) ? 'keyword' : 'plain', identifier[0]);
      index += identifier[0].length;
      continue;
    }
    const number = source.slice(index).match(/^(?:0[xob][\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    if (number) {
      pushSegment(segments, 'number', number[0]);
      index += number[0].length;
      continue;
    }

    pushSegment(segments, 'plain', character);
    index += 1;
  }
  return segments;
}

function styleCodeSegment(segment) {
  switch (segment.role) {
    case 'keyword':
      return styled(segment.text, { color: paletteColor('secondary'), bold: true });
    case 'string':
      return styled(segment.text, { color: paletteColor('success') });
    case 'comment':
      return styled(segment.text, { color: paletteColor('muted'), dim: true });
    case 'number':
      return styled(segment.text, { color: paletteColor('accent') });
    default:
      return segment.text;
  }
}

function highlightCode(code, lang, opts = {}) {
  return withoutTerminalColor(opts, () => {
    const clean = inputText(code, opts);
    const language = languageName(lang);
    const supported = Object.prototype.hasOwnProperty.call(KEYWORDS, language);
    const rendered = supported
      ? tokenizeCode(clean, language).map(styleCodeSegment).join('')
      : C.dim(clean);
    return capOutput(rendered, opts);
  });
}

function expandTabs(value, tabWidth = 4) {
  let column = 0;
  let output = '';

  for (const grapheme of segmentGraphemes(String(value))) {
    if (grapheme === '\n') {
      output += grapheme;
      column = 0;
    } else if (grapheme === '\t') {
      const spaces = tabWidth - (column % tabWidth);
      output += ' '.repeat(spaces);
      column += spaces;
    } else {
      output += grapheme;
      column += stringWidth(grapheme);
    }
  }
  return output;
}

function renderDiff(oldStr, newStr, opts = {}) {
  return withoutTerminalColor(opts, () => {
    const oldText = inputText(oldStr, opts);
    const newText = inputText(newStr, opts);
    const path = capPlainBytes(sanitize(opts.path || 'file'), 1024) || 'file';
    let patch;
    try {
      patch = diff.createTwoFilesPatch(path, path, oldText, newText, '', '', {
        context: positiveInt(opts.context, 3),
      });
    } catch {
      patch = `--- ${path}\n+++ ${path}\n`;
    }

    let patchLines = expandTabs(patch).split('\n');
    if (opts.compact === true) {
      const firstHunk = patchLines.findIndex(line => line.startsWith('@@'));
      patchLines = firstHunk === -1 ? [] : patchLines.slice(firstHunk);
    }

    const rendered = patchLines.map(line => {
      if (line.startsWith('@@')) return styled(line, { color: paletteColor('secondary') });
      if (line.startsWith('+++') || line.startsWith('---')) return C.bold(line);
      if (line.startsWith('+')) return styled(line, { color: paletteColor('success') });
      if (line.startsWith('-')) return styled(line, { color: paletteColor('danger') });
      if (line.startsWith(' ')) return C.dim(line);
      return C.muted(line);
    }).join('\n');
    return capOutput(rendered, opts);
  });
}

module.exports = {
  renderMarkdown,
  highlightCode,
  renderDiff,
};
