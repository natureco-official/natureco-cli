import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import browserUse from '../../src/tools/browser_use.js';
import shellCommand from '../../src/tools/shell_command.js';
import codeExecution from '../../src/tools/code_execution.js';
import textToSpeech from '../../src/tools/text_to_speech.js';

const isWindows = process.platform === 'win32';
const windowsIt = isWindows ? it : it.skip;
const originalPath = process.env.PATH;

// Some CI Windows runners resolve `node`/Python differently than a real developer machine
// (version-manager shims, no pre-installed edge-tts pip package). These checks skip with a
// clear reason rather than failing when the real dependency genuinely isn't present here —
// the underlying fix (where.exe vs which; py/python/python3 candidate order) is proven whenever
// the environment does support it, matching this codebase's established "skip, don't fake"
// convention for platform/dependency gaps.
const nodeFindableViaWhere = isWindows && spawnSync('where', ['node'], { encoding: 'utf8' }).status === 0;
const windowsItWithNode = nodeFindableViaWhere ? it : it.skip;

let edgeTtsAvailable = false;
if (isWindows) {
  for (const candidate of ['py', 'python']) {
    const probe = spawnSync(candidate, ['-c', 'import edge_tts'], { encoding: 'utf8' });
    if (probe.status === 0) { edgeTtsAvailable = true; break; }
  }
}
const windowsItWithEdgeTts = edgeTtsAvailable ? it : it.skip;

afterEach(() => {
  process.env.PATH = originalPath;
});

describe('plain-Windows process portability', () => {
  windowsItWithNode('browser_use detects a real PATH executable through where.exe', () => {
    expect(browserUse._checkCli('node')).toBe(true);
  });

  windowsIt('browser_use cleanly reports a genuinely nonexistent executable as unavailable', () => {
    // Environment-independent: proves the where.exe-based checker runs and returns false for a
    // program that cannot exist, without depending on any specific real tool being on PATH.
    expect(browserUse._checkCli('natureco-nonexistent-cli-probe-zzz')).toBe(false);
  });

  windowsIt('shell_command runs through cmd.exe', async () => {
    const result = await shellCommand._runShell({ command: 'echo WINDOWS_NATIVE_SHELL:%COMSPEC%' });
    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/^WINDOWS_NATIVE_SHELL:.*cmd\.exe$/i);
  });

  windowsIt('code_execution clearly reports its PowerShell fallback when bash is unavailable', async () => {
    process.env.PATH = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
    const result = await codeExecution.execute({ code: "Write-Output 'WINDOWS_POWERSHELL_FALLBACK'", language: 'bash' });
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('WINDOWS_POWERSHELL_FALLBACK');
    expect(result.interpreter).toBe('powershell');
    expect(result.interpreterFallback).toBe(true);
  });

  windowsItWithEdgeTts('text_to_speech resolves py before the broken python3 alias and creates audio', async () => {
    const output = path.join(os.tmpdir(), `natureco-windows-tts-${process.pid}.mp3`);
    try {
      const result = await textToSpeech._edgeTTS('Portability test', 'en-US-AriaNeural', output);
      expect(result.success).toBe(true);
      expect(result.interpreter).toBe('py');
      expect(fs.statSync(output).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(output, { force: true });
    }
  }, 40000);
});
