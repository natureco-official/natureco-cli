'use strict';

const os = require('os');
const { getLang } = require('./i18n');
const { renderDiff } = require('./render');
const {
  CAPS,
  PALETTE,
  styled,
  stripAnsi,
  stringWidth,
  padTo,
  truncateAnsi,
  wrapAnsi,
} = require('./tui');

const DEFAULT_WIDTH = 80;
const DEFAULT_MAX_LINES = 14;
const DEFAULT_MAX_INPUT_BYTES = 256 * 1024;

/* eslint-disable no-control-regex -- terminal control bytes are deliberately removed */
const CONTROL_SEQUENCE_RE =
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[P^_X][\s\S]*?(?:\x1b\\|$)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[ -/]*[0-~]|\x9d[^\x07\x9c]*(?:\x07|\x9c)?|[\x90\x98\x9e\x9f][\s\S]*?(?:\x9c|$)|\x9b[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHARACTER_RE = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;
/* eslint-enable no-control-regex */

const ARG_ALLOWLISTS = Object.freeze({
  read_file: ['path', 'startLine', 'endLine', 'offset', 'limit'],
  write_file: ['path', 'filePath', 'encoding'],
  edit_file: ['path', 'filePath', 'replace_all'],
  structural_patch: ['path', 'filePath', 'operation'],
  list_dir: ['path', 'depth'],
  file_search: ['query', 'path', 'glob', 'limit'],
  grep_search: ['query', 'path', 'glob', 'caseSensitive', 'limit'],
  bash: ['command', 'cwd', 'timeout'],
  shell_command: ['command', 'cwd', 'timeout'],
  web_search: ['query', 'limit'],
  web_readability: ['url'],
  browser: ['action', 'url', 'ref'],
  workflow: ['action', 'task'],
  memory: ['action', 'query', 'key'],
  memory_search: ['query', 'limit'],
  '*': ['action', 'query', 'url', 'name', 'id', 'taskId', 'command', 'path', 'filePath'],
});

const RESULT_NOISE_KEYS = new Set([
  'size', 'bytes', 'byteLength', 'path', 'filePath', 'fileCount', 'absolutePath',
]);
const SECRET_KEY_RE = /(?:api[_-]?key|access[_-]?token|auth(?:orization)?|credential|password|secret|token)/i;
const SENSITIVE_PATH_RE =
  /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.npmrc|\.pypirc|credentials?(?:\.[^\\/]*)?|secrets?(?:\.[^\\/]*)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^\\/]*\.(?:pem|key|p12|pfx|kdbx))$/i;

function L(tr, en, opts = {}) {
  if (opts.lang === 'en') return en;
  if (opts.lang === 'tr') return tr;
  return getLang() === 'en' ? en : tr;
}

function sanitize(value) {
  let text;
  try {
    text = String(value ?? '');
  } catch {
    text = '';
  }
  return text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_SEQUENCE_RE, '')
    .replace(CONTROL_CHARACTER_RE, '');
}

function capBytes(value, maximum = DEFAULT_MAX_INPUT_BYTES) {
  const text = sanitize(value);
  if (Buffer.byteLength(text, 'utf8') <= maximum) return text;
  let output = '';
  let bytes = 0;
  const budget = Math.max(0, maximum - Buffer.byteLength('…'));
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > budget) break;
    output += character;
    bytes += size;
  }
  return output + '…';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactText(value, opts = {}) {
  let text = capBytes(value, opts.maxInputBytes || DEFAULT_MAX_INPUT_BYTES);
  const home = sanitize(opts.home || os.homedir());
  if (home) text = text.replace(new RegExp(escapeRegExp(home), 'gi'), '~');
  text = text
    .replace(/(?:\/Users\/|\/home\/)[^/\\\s"'`]+/gi, '~')
    .replace(/[A-Z]:\\Users\\[^\\\s"'`]+/gi, '~')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/gi, '***')
    .replace(
      /\b(api[_-]?key|access[_-]?token|auth(?:orization)?|password|secret|token)(\s*["']?\s*[:=]\s*["']?)([^"',\s}\]]+)/gi,
      '$1$2***',
    );
  return text;
}

function redactValue(value, opts, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(value, opts);
  if (typeof value !== 'object') return redactText(value, opts);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redactValue(item, opts, seen));
  const output = {};
  for (const [rawKey, item] of Object.entries(value)) {
    const key = sanitize(rawKey);
    if (RESULT_NOISE_KEYS.has(key)) continue;
    output[key] = SECRET_KEY_RE.test(key) ? '***' : redactValue(item, opts, seen);
  }
  return output;
}

function stringifyValue(value, opts = {}) {
  if (typeof value === 'string') return redactText(value, opts);
  try {
    return redactText(JSON.stringify(redactValue(value, opts)), opts);
  } catch {
    return redactText(value, opts);
  }
}

function normalizeResult(result, opts = {}) {
  if (result === undefined) return { status: 'running', success: null, text: '' };
  if (typeof result === 'string') {
    return { status: 'success', success: true, text: redactText(result, opts) };
  }
  if (result instanceof Error) {
    return { status: 'error', success: false, text: redactText(result.message, opts) };
  }
  if (result && typeof result === 'object') {
    if (result.error !== undefined && result.error !== null && result.error !== '') {
      return { status: 'error', success: false, text: stringifyValue(result.error, opts) };
    }
    if (result.success === false) {
      const failure = Object.prototype.hasOwnProperty.call(result, 'result')
        ? result.result
        : Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'success'));
      return { status: 'error', success: false, text: stringifyValue(failure, opts) };
    }
    if (Object.prototype.hasOwnProperty.call(result, 'result')) {
      return { status: 'success', success: true, text: stringifyValue(result.result, opts) };
    }
    const direct = Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'success'));
    return { status: 'success', success: true, text: stringifyValue(direct, opts) };
  }
  return { status: 'success', success: true, text: stringifyValue(result, opts) };
}

function summarizeArgs(name, args, opts = {}) {
  if (!args || typeof args !== 'object') return '';
  const allowlist = ARG_ALLOWLISTS[name] || ARG_ALLOWLISTS['*'];
  const fields = [];
  for (const key of allowlist) {
    if (!Object.prototype.hasOwnProperty.call(args, key) || args[key] === undefined) continue;
    const value = SECRET_KEY_RE.test(key) ? '***' : redactValue(args[key], opts);
    const rendered = typeof value === 'string' ? value : stringifyValue(value, opts);
    fields.push(`${sanitize(key)}=${rendered}`);
  }
  return fields.join(' · ');
}

function snapshotContent(snapshot) {
  if (typeof snapshot === 'string') return { available: true, content: snapshot };
  if (snapshot && snapshot.available && typeof snapshot.content === 'string') return snapshot;
  return { available: false, reason: snapshot?.reason || 'unavailable' };
}

function isSensitivePath(filePath) {
  return SENSITIVE_PATH_RE.test(sanitize(filePath));
}

function colorDisabled(opts) {
  return opts.color === false ||
    process.env.NO_COLOR !== undefined ||
    process.env.FORCE_COLOR === '0' ||
    (!CAPS.color && !CAPS.trueColor);
}

function statusStyle(model) {
  if (model.status === 'running') {
    return { icon: '●', color: PALETTE.accent };
  }
  if (model.success) return { icon: '✓', color: PALETTE.success };
  return { icon: '✗', color: PALETTE.danger };
}

function bodyLines(name, args, model, opts, innerWidth) {
  const lines = [];
  const argsText = summarizeArgs(name, args, opts);
  if (argsText) {
    lines.push(styled(`${L('Argümanlar', 'Args', opts)}: `, { color: PALETTE.muted }) + argsText);
  }

  if (name === 'write_file' || name === 'edit_file') {
    const filePath = args?.path || args?.filePath || opts.path || 'file';
    const before = snapshotContent(opts.before);
    const after = snapshotContent(opts.after);
    if (isSensitivePath(filePath)) {
      lines.push(styled(
        L('Hassas dosya değişikliği — diff gizlendi.', 'Sensitive file change — diff suppressed.', opts),
        { color: PALETTE.muted },
      ));
    } else if (before.available && after.available) {
      const cleanPath = redactText(filePath, opts);
      const diff = renderDiff(
        redactText(before.content, opts),
        redactText(after.content, opts),
        {
          path: cleanPath,
          compact: true,
          maxColumns: innerWidth,
          maxBytes: opts.maxDiffBytes || 64 * 1024,
        },
      );
      lines.push(...diff.split('\n'));
    } else if (
      name === 'edit_file' &&
      model.success &&
      typeof args?.old_string === 'string' &&
      typeof args?.new_string === 'string'
    ) {
      const diff = renderDiff(
        redactText(args.old_string, opts),
        redactText(args.new_string, opts),
        {
          path: redactText(filePath, opts),
          compact: true,
          maxColumns: innerWidth,
          maxBytes: opts.maxDiffBytes || 64 * 1024,
        },
      );
      lines.push(...diff.split('\n'));
    } else {
      lines.push(styled(
        L('Dosya değişti — diff anlık görüntüsü kullanılamıyor.', 'File changed — diff snapshot unavailable.', opts),
        { color: PALETTE.muted },
      ));
    }
  } else if (model.text) {
    const label = model.success === false
      ? L('Hata', 'Error', opts)
      : L('Sonuç', 'Result', opts);
    lines.push(styled(`${label}: `, {
      color: model.success === false ? PALETTE.danger : PALETTE.success,
    }) + model.text);
  }
  return lines;
}

function wrapLines(lines, width) {
  const output = [];
  for (const line of lines) {
    const wrapped = wrapAnsi(line, width).split('\n');
    output.push(...wrapped);
  }
  return output;
}

function renderToolCall(name, args, result, opts = {}) {
  const width = Math.max(8, Math.min(
    Number(opts.width) || Number(CAPS.width) || DEFAULT_WIDTH,
    Number(opts.maxWidth) || 120,
  ));
  const innerWidth = Math.max(1, width - 4);
  const maxLines = Math.max(2, Number(opts.maxLines) || DEFAULT_MAX_LINES);
  const cleanName = redactText(name, opts);
  const model = normalizeResult(result, opts);
  const status = statusStyle(model);
  const title = truncateAnsi(
    `${status.icon} ${L('Araç', 'Tool', opts)}: ${cleanName}`,
    Math.max(1, width - 5),
  );
  const titleStyled = styled(title, { color: status.color, bold: true });
  const topPrefix = `╭─ ${titleStyled} `;
  const top = topPrefix + styled(
    '─'.repeat(Math.max(0, width - stringWidth(topPrefix) - 1)),
    { color: PALETTE.muted },
  ) + '╮';

  let renderedBody = wrapLines(bodyLines(cleanName, args, model, opts, innerWidth), innerWidth);
  if (renderedBody.length > maxLines) {
    const hidden = renderedBody.length - (maxLines - 1);
    renderedBody = renderedBody.slice(0, maxLines - 1);
    const hint = opts.expandHint
      ? ` · ${L('tümü için Ctrl+O', 'Ctrl+O to view all', opts)}`
      : '';
    renderedBody.push(styled(
      `… (+${hidden} ${L('satır', 'lines', opts)})${hint}`,
      { color: PALETTE.muted, dim: true },
    ));
  }

  const border = styled('│', { color: PALETTE.muted });
  const card = [
    top,
    ...renderedBody.map(line =>
      `${border} ${padTo(truncateAnsi(line, innerWidth), innerWidth)} ${border}`),
    styled(`╰${'─'.repeat(Math.max(0, width - 2))}╯`, { color: PALETTE.muted }),
  ].join('\n');

  return colorDisabled(opts) ? stripAnsi(card) : card;
}

module.exports = {
  ARG_ALLOWLISTS,
  isSensitivePath,
  normalizeResult,
  redactText,
  renderToolCall,
  summarizeArgs,
};
