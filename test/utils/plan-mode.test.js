import { describe, it, expect, beforeEach } from 'vitest';

describe('plan-mode', () => {
  let planMode;

  beforeEach(() => {
    delete require.cache[require.resolve('../../src/utils/plan-mode')];
    planMode = require('../../src/utils/plan-mode');
    // Reset singleton
    const pm = planMode.getPlanMode();
    pm.state = 'normal';
    pm.plan = null;
    pm.steps = [];
    pm.filesRead = [];
    pm.commandsRun = [];
    pm.planHistory = [];
  });

  describe('enter/exit', () => {
    it('enters plan mode from normal', () => {
      const pm = planMode.getPlanMode();
      expect(pm.enter()).toBe(true);
      expect(pm.isPlanning()).toBe(true);
    });

    it('cannot enter plan mode when already planning', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      expect(pm.enter()).toBe(false);
    });

    it('exits plan mode with plan', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      expect(pm.exit('# Plan')).toBe(true);
      expect(pm.inReview()).toBe(true);
      expect(pm.plan).toBe('# Plan');
    });

    it('cannot exit when not planning', () => {
      const pm = planMode.getPlanMode();
      expect(pm.exit('# Plan')).toBe(false);
    });
  });

  describe('approve/reject', () => {
    it('approves plan and returns to normal', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      pm.exit('# Plan');
      expect(pm.approve()).toBe(true);
      expect(pm.isNormal()).toBe(true);
    });

    it('rejects plan and returns to planning', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      pm.exit('# Plan');
      expect(pm.reject()).toBe(true);
      expect(pm.isPlanning()).toBe(true);
    });
  });

  describe('checkTool', () => {
    it('allows all tools in normal mode', () => {
      const pm = planMode.getPlanMode();
      expect(pm.checkTool('write_file', { filePath: '/tmp/x' }).allowed).toBe(true);
      expect(pm.checkTool('bash', { command: 'rm -rf /' }).allowed).toBe(true);
    });

    it('blocks write tools in plan mode', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      const result = pm.checkTool('write_file', { filePath: '/tmp/x' });
      expect(result.allowed).toBe(false);
    });

    it('blocks destructive bash in plan mode', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      expect(pm.checkTool('bash', { command: 'git push' }).allowed).toBe(false);
      expect(pm.checkTool('bash', { command: 'rm -rf /' }).allowed).toBe(false);
      expect(pm.checkTool('bash', { command: 'echo hi' }).allowed).toBe(true);
    });

    it('allows read/search tools in plan mode', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      expect(pm.checkTool('read_file', { filePath: 'src/index.js' }).allowed).toBe(true);
      expect(pm.checkTool('grep_search', { pattern: 'foo' }).allowed).toBe(true);
    });
  });

  describe('recordTool', () => {
    it('records files read in plan mode', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      pm.recordTool('read_file', { filePath: 'src/index.js' });
      pm.recordTool('grep_search', { pattern: 'foo' });
      expect(pm.filesRead).toContain('src/index.js');
    });

    it('records commands run in plan mode', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      pm.recordTool('bash', { command: 'node -v' });
      expect(pm.commandsRun).toContain('node -v');
    });

    it('does not record in normal mode', () => {
      const pm = planMode.getPlanMode();
      pm.recordTool('read_file', { filePath: 'src/index.js' });
      expect(pm.filesRead).toEqual([]);
    });
  });

  describe('getSystemPrompt', () => {
    it('returns empty in normal mode', () => {
      const pm = planMode.getPlanMode();
      expect(pm.getSystemPrompt()).toBe('');
    });

    it('returns plan mode instructions in planning mode', () => {
      const pm = planMode.getPlanMode();
      pm.enter();
      const prompt = pm.getSystemPrompt();
      expect(prompt).toContain('PLAN MODE');
      expect(prompt).toContain('ExitPlanMode');
    });
  });
});
