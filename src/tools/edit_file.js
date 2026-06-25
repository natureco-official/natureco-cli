/**
 * edit_file — Precise string replacement in an existing file.
 *
 * Modeled after Claude Code's `Edit` tool semantics, with three rules
 * that catch ~all "the agent broke my file" failure modes:
 *
 *   1. The file must exist (no accidental file creation via Edit — use
 *      write_file for that).
 *   2. `old_string` must appear in the file. If it doesn't, return an
 *      error pointing at the file path; do NOT silently no-op.
 *   3. `old_string` must be UNIQUE in the file unless `replace_all: true`
 *      is passed. Otherwise the agent would mutate an unintended site
 *      without realizing it.
 *
 * On success: writes via atomic rename (no half-edited files on crash),
 * returns the patched line count + a small diff summary.
 *
 * Why this exists in natureco: until this commit, natureco's only file
 * mutation tool was `write_file`, which overwrites the entire file. Any
 * "rename X to Y in src/foo.js" request meant the agent had to read the
 * file, do the substitution in its head, and re-emit the whole file —
 * a process that loses indentation, drops trailing newlines, and
 * occasionally hallucinates unrelated edits. `edit_file` makes the
 * mutation a 2-3 line delta the agent can't get wrong.
 */
const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('../utils/atomic-file');

function _expand(p) {
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(require('os').homedir(), p.slice(1));
  }
  return path.resolve(p);
}

async function editFile({ path: filePath, old_string, new_string, replace_all = false }) {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'path is required (absolute path or ~-prefixed)' };
  }
  if (typeof old_string !== 'string' || old_string.length === 0) {
    return { success: false, error: 'old_string is required and cannot be empty' };
  }
  if (typeof new_string !== 'string') {
    return { success: false, error: 'new_string is required (use empty string to delete)' };
  }
  if (old_string === new_string) {
    return { success: false, error: 'old_string and new_string are identical — nothing to do' };
  }

  const target = _expand(filePath);
  if (!fs.existsSync(target)) {
    return {
      success: false,
      error: `file not found: ${target}. Edit cannot create files; use write_file for that.`,
    };
  }
  let original;
  try {
    original = fs.readFileSync(target, 'utf8');
  } catch (e) {
    return { success: false, error: `read failed: ${e.message}` };
  }

  // Find occurrences. Use indexOf loop for an accurate count without
  // pulling in regex escaping bugs (old_string is raw text, not a pattern).
  let count = 0;
  let i = 0;
  while ((i = original.indexOf(old_string, i)) !== -1) {
    count++;
    i += old_string.length;
  }

  if (count === 0) {
    // Help the agent debug: include a small excerpt so it sees how close
    // its old_string is to reality (whitespace, casing).
    const excerpt = original.length > 400 ? original.slice(0, 400) + '\n... (truncated)' : original;
    return {
      success: false,
      error: 'old_string not found in file',
      path: target,
      hint: 'Verify exact whitespace, casing, and that you Read the file recently.',
      file_excerpt: excerpt,
    };
  }

  if (count > 1 && !replace_all) {
    return {
      success: false,
      error: `old_string is not unique (${count} occurrences). Pass replace_all: true to change every instance, or extend old_string with more surrounding context to make it unique.`,
      path: target,
      occurrences: count,
    };
  }

  const updated = replace_all
    ? original.split(old_string).join(new_string)
    : original.replace(old_string, new_string);

  try {
    writeFileAtomicSync(target, updated);
  } catch (e) {
    return { success: false, error: `write failed: ${e.message}` };
  }

  const linesBefore = original.split('\n').length;
  const linesAfter = updated.split('\n').length;
  const lineDelta = linesAfter - linesBefore;

  return {
    success: true,
    path: target,
    replacements: count,
    replace_all: !!replace_all,
    lines_before: linesBefore,
    lines_after: linesAfter,
    line_delta: lineDelta,
  };
}

module.exports = {
  name: 'edit_file',
  description:
    'Performs exact string replacement in an existing file. The old_string ' +
    'must match the file content EXACTLY (including whitespace and indentation) ' +
    'and must be UNIQUE unless replace_all=true. Use this for any targeted ' +
    'rename/refactor/patch instead of rewriting the file with write_file. ' +
    'Fails with a helpful hint when old_string is missing or ambiguous.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path of file to edit (~/-prefix allowed)' },
      old_string: { type: 'string', description: 'Exact substring to replace (case-sensitive, whitespace-sensitive)' },
      new_string: { type: 'string', description: 'Replacement text (must differ from old_string; pass "" to delete)' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence instead of failing on multiple matches', default: false },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  execute: editFile,
  // Exposed for unit tests.
  _internals: { editFile },
};
