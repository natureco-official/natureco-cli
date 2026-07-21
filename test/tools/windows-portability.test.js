import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => {
  process.env.PATH = originalPath;
});

describe('plain-Windows process portability', () => {
  windowsIt('browser_use detects a real PATH executable through where.exe', () => {
    expect(browserUse._checkCli('node')).toBe(true);
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

  windowsIt('text_to_speech resolves py before the broken python3 alias and creates audio', async () => {
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
