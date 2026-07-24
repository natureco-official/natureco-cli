#!/usr/bin/env node
'use strict';

const tui = require('../src/utils/tui');

const mode = String(process.env.NATURECO_RENDER_MODE || '').toLowerCase();
if (process.env.NO_COLOR || process.env.FORCE_COLOR === '0' || mode === 'none' || mode === 'no-color') {
  tui.CAPS.color = false;
  tui.CAPS.trueColor = false;
} else if (mode === '256' || mode === '256-color') {
  tui.CAPS.color = true;
  tui.CAPS.trueColor = false;
} else if (mode === 'truecolor' || mode === '24bit') {
  tui.CAPS.color = true;
  tui.CAPS.trueColor = true;
} else {
  tui.detectCapabilities();
}

const { renderMarkdown, highlightCode, renderDiff } = require('../src/utils/render');
const { renderToolCall } = require('../src/utils/tool-card');

const markdown = [
  '# NatureCo render engine',
  '',
  'A **bold** idea with *emphasis*, `inlineCode()`, and [a link](https://natureco.me).',
  '',
  '> Safe terminal output, even for untrusted text.',
  '',
  '1. Tokenize with marked',
  '2. Render our own ANSI',
  '   - Keep nested lists readable',
  '',
  '```js',
  'const greeting = "hello // still a string";',
  '// This is a comment',
  'console.log(greeting);',
  '```',
].join('\n');

process.stdout.write(`${renderMarkdown(markdown)}\n\n`);
process.stdout.write(`${highlightCode('const answer = 42; // highlighted fence', 'js')}\n\n`);
process.stdout.write(`${renderDiff('alpha\nbeta\n', 'alpha\ngamma\n', { path: 'demo.txt' })}\n\n`);
process.stdout.write(`${renderToolCall(
  'edit_file',
  { path: 'demo.txt', old_string: 'beta', new_string: 'gamma' },
  { success: true, replacements: 1 },
  { before: 'alpha\nbeta\n', after: 'alpha\ngamma\n' },
)}\n`);
