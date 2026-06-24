import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('agents-md utilities', () => {
  let mod;
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    mod = require('../../src/utils/agents-md');
    mod.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('findAgentsMd (via loadInstructions)', () => {
    it('should return null when no AGENTS.md exists', () => {
      expect(mod.loadInstructions(tempDir)).toBeNull();
    });

    it('should find AGENTS.md in directory', () => {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'content', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('content');
    });

    it('should find .natureco/AGENTS.md', () => {
      fs.mkdirSync(path.join(tempDir, '.natureco'));
      fs.writeFileSync(path.join(tempDir, '.natureco', 'AGENTS.md'), 'natureco content', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('natureco content');
    });

    it('should find .natureco/INSTRUCTIONS.md', () => {
      fs.mkdirSync(path.join(tempDir, '.natureco'));
      fs.writeFileSync(path.join(tempDir, '.natureco', 'INSTRUCTIONS.md'), 'instructions', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('instructions');
    });

    it('should prefer AGENTS.md over .natureco/AGENTS.md', () => {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'root agents', 'utf8');
      fs.mkdirSync(path.join(tempDir, '.natureco'));
      fs.writeFileSync(path.join(tempDir, '.natureco', 'AGENTS.md'), 'natureco agents', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('root agents');
    });

    it('should walk up to parent directory', () => {
      const childDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(childDir);
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'parent agents', 'utf8');
      expect(mod.loadInstructions(childDir)).toBe('parent agents');
    });
  });

  describe('loadInstructions', () => {
    it('should return file content', () => {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'some content', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('some content');
    });

    it('should return null for missing file', () => {
      expect(mod.loadInstructions(tempDir)).toBeNull();
    });
  });

  describe('injectIntoPrompt', () => {
    it('should return original prompt when no AGENTS.md', () => {
      const result = mod.injectIntoPrompt('Hello', tempDir);
      expect(result).toBe('Hello');
    });

    it('should append AGENTS.md content with header', () => {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'Do stuff', 'utf8');
      const result = mod.injectIntoPrompt('System prompt', tempDir);
      expect(result).toContain('## Project Instructions');
      expect(result).toContain('Do stuff');
      expect(result).toContain('System prompt');
    });
  });

  describe('clearCache', () => {
    it('should clear the cache so next call re-scans', () => {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'first', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('first');

      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), 'second', 'utf8');
      expect(mod.loadInstructions(tempDir)).toBe('first');

      mod.clearCache();
      expect(mod.loadInstructions(tempDir)).toBe('second');
    });
  });
});
