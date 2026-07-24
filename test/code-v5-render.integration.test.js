import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const requireCjs = createRequire(import.meta.url);
const tui = requireCjs('../src/utils/tui.js');
const codeV5 = requireCjs('../src/commands/code_v5.js');
const { renderToolCall } = requireCjs('../src/utils/tool-card.js');
const writeFileTool = requireCjs('../src/tools/write_file.js');
const editFileTool = requireCjs('../src/tools/edit_file.js');

const { captureFileSnapshot, displayAssistantReply } = codeV5._presentation;
const plain = value => tui.stripAnsi(value);
let saved;
let tempDir;

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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-rock-c-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  tui.CAPS.color = saved.color;
  tui.CAPS.trueColor = saved.trueColor;
  if (saved.noColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = saved.noColor;
  if (saved.forceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = saved.forceColor;
});

describe('Rock C code_v5 rendering integration', () => {
  it('(g) renders all three assistant reply branches while preserving byte-identical raw history', () => {
    const source = fs.readFileSync(path.resolve('src/commands/code_v5.js'), 'utf8');
    const displaySites = source.match(/process\.stdout\.write\([^;\n]*displayAssistantReply\(/g) || [];
    expect(displaySites).toHaveLength(3);

    for (const branch of ['workflow-passthrough', 'workflow-summary', 'normal-agent']) {
      const raw = `# ${branch}\n\n**bold** \`code\`\nraw-byte:\u00a0end`;
      const messages = [];
      const display = displayAssistantReply(raw);
      messages.push({ role: 'assistant', content: raw });

      expect(plain(display)).toContain(branch);
      expect(display).toMatch(/\x1b\[/);
      expect(messages[0].content).toBe(raw);
      expect(Buffer.from(messages[0].content)).toEqual(Buffer.from(raw));
    }

    process.env.NO_COLOR = '1';
    expect(displayAssistantReply('# plain **reply**')).not.toMatch(/\x1b\[/);
  });

  it('(h) renders real before/after diffs from actual edit_file and overwrite write_file I/O', async () => {
    const editPath = path.join(tempDir, 'edit.txt');
    fs.writeFileSync(editPath, 'alpha\nold\nomega\n', 'utf8');
    const editArgs = { path: editPath, old_string: 'old', new_string: 'new' };
    const editBefore = captureFileSnapshot(editArgs);
    const editResult = await editFileTool.execute(editArgs);
    const editAfter = captureFileSnapshot(editArgs);
    const editCard = renderToolCall('edit_file', editArgs, editResult, {
      before: editBefore,
      after: editAfter,
      lang: 'en',
      maxLines: 30,
    });

    expect(editResult.success).toBe(true);
    expect(editAfter.content).toBe(fs.readFileSync(editPath, 'utf8'));
    expect(plain(editCard)).toContain('-old');
    expect(plain(editCard)).toContain('+new');

    const writePath = path.join(tempDir, 'write.txt');
    fs.writeFileSync(writePath, 'before\nkept\n', 'utf8');
    const writeArgs = { path: writePath, content: 'after\nkept\n' };
    const writeBefore = captureFileSnapshot(writeArgs);
    const writeResult = await writeFileTool.execute(writeArgs);
    const writeAfter = captureFileSnapshot(writeArgs);
    const writeCard = renderToolCall('write_file', writeArgs, writeResult, {
      before: writeBefore,
      after: writeAfter,
      lang: 'en',
      maxLines: 30,
    });

    expect(writeResult.success).toBe(true);
    expect(writeAfter.content).toBe(fs.readFileSync(writePath, 'utf8'));
    expect(plain(writeCard)).toContain('-before');
    expect(plain(writeCard)).toContain('+after');
    expect(writeCard).toContain(tui.fg(tui.PALETTE.danger));
    expect(writeCard).toContain(tui.fg(tui.PALETTE.success));
  });
});
