/**
 * read_file — Read a file's contents.
 *
 * Backwards-compatible upgrade (v5.7.1): the old call shape
 * `{ path }` still works and still returns `{success, path, content, size,
 * truncated}` exactly as before. The new options add Claude Code-style
 * pagination + line-numbered output:
 *
 *   - `offset` (line number, 1-based): skip the first N-1 lines.
 *   - `limit`  (line count): read at most this many lines.
 *   - `numbered` (bool): if true, prefix each line with its 1-based
 *     line number + a tab (matches `cat -n`); useful when the agent
 *     then needs to call edit_file and wants to cite exact lines.
 *
 * Other safety touches retained from the original:
 *   - File-existence + not-a-file checks.
 *   - 1 MB cap before falling into "show me 50 KB" mode (raised to
 *     2 MB now that line-based pagination exists — the agent can ask
 *     for `{offset, limit}` instead).
 *   - Returns `{success: false, error}` rather than throwing.
 */
const fs = require('fs');

const DEFAULT_LINE_LIMIT = 2000;   // matches Claude Code's Read default
const HARD_BYTE_CAP = 2 * 1024 * 1024; // 2 MB — agent should paginate above this
const SOFT_BYTE_PREVIEW = 50_000;       // bytes shown for the "file too large" preview

function _formatNumbered(text, startLine) {
  const lines = text.split('\n');
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    out += String(startLine + i) + '\t' + lines[i];
    if (i < lines.length - 1) out += '\n';
  }
  return out;
}

async function readFile(params) {
  try {
    const { expandPath } = require('../utils/paths');
    const filePath = expandPath(params.path);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return { success: false, error: 'Path is not a file' };
    }

    const offset = Math.max(1, Number(params.offset) || 1);
    const limit = params.limit !== undefined ? Math.max(1, Number(params.limit)) : null;
    const numbered = !!params.numbered;
    const wantsPagination = params.offset !== undefined || params.limit !== undefined;

    // Large-file guard. With pagination the agent can read what it needs;
    // without it we still show a useful preview (matches old behavior).
    if (stats.size > HARD_BYTE_CAP && !wantsPagination) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(SOFT_BYTE_PREVIEW);
      fs.readSync(fd, buf, 0, SOFT_BYTE_PREVIEW, 0);
      fs.closeSync(fd);
      const preview = '[Büyük dosya — ilk ~50KB gösteriliyor; offset/limit ile sayfalayın]\n' + buf.toString('utf8');
      return {
        success: true,
        path: filePath,
        content: preview,
        size: stats.size,
        truncated: true,
      };
    }

    const raw = fs.readFileSync(filePath, 'utf-8');

    if (!wantsPagination && !numbered) {
      // Original return shape — keep byte-for-byte compatible.
      return {
        success: true,
        path: filePath,
        content: raw,
        size: stats.size,
        truncated: false,
      };
    }

    // Pagination + optional line numbers.
    const allLines = raw.split('\n');
    const totalLines = allLines.length;
    const start = Math.min(offset, totalLines + 1) - 1; // to 0-based
    const effectiveLimit = limit !== null ? limit : DEFAULT_LINE_LIMIT;
    const end = Math.min(start + effectiveLimit, totalLines);
    const slice = allLines.slice(start, end);
    const sliceText = slice.join('\n');
    const content = numbered ? _formatNumbered(sliceText, start + 1) : sliceText;

    return {
      success: true,
      path: filePath,
      content,
      size: stats.size,
      truncated: end < totalLines,
      total_lines: totalLines,
      lines_returned: slice.length,
      offset: start + 1,
      limit: effectiveLimit,
      numbered,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  name: 'read_file',
  description:
    'PRIMARY TOOL: Read a file. Supports Claude Code-style pagination ' +
    '(offset + limit, 1-based line numbers) and optional `numbered` output ' +
    '(prefixes each line with its number + tab, matching `cat -n`). ' +
    'For listing directories use the filesystem tool. For ranges past 2000 ' +
    'lines, call again with a new offset.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read (absolute or ~-prefix)' },
      offset: { type: 'integer', description: '1-based line number to start at (default 1)', minimum: 1 },
      limit: { type: 'integer', description: `Maximum lines to return (default ${DEFAULT_LINE_LIMIT})`, minimum: 1 },
      numbered: { type: 'boolean', description: 'Prefix each line with its 1-based line number + tab (cat -n format)', default: false },
    },
    required: ['path'],
  },
  execute: readFile,
  _internals: { readFile, _formatNumbered },
};
