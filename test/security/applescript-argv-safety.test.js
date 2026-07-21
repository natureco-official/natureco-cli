import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import os from 'os';

const requireCjs = createRequire(import.meta.url);
const execFileSync = vi.fn(() => Buffer.from('created-id\n'));
const injection = '" & (do shell script "touch /tmp/pwn") & "';

function invocationAt(index = 0) {
  const [program, args, options] = execFileSync.mock.calls[index];
  expect(program).toBe('osascript');
  expect(args[0]).toBe('-');
  expect(options).toMatchObject({ input: expect.any(String), timeout: 10000 });
  expect(options.input).toContain('on run argv');
  return { args, script: options.input };
}

function expectDataOnlyInArgv(call, values) {
  const { args, script } = invocationAt(call);
  for (const value of values) {
    expect(args).toContain(value);
    expect(script).not.toContain(value);
  }
}

function expectComponentDateConstruction(script, variable, firstArgIndex) {
  expect(script).toContain(`set ${variable} to current date`);
  expect(script).toContain(`set year of ${variable} to (item ${firstArgIndex} of argv) as integer`);
  expect(script).toContain(`set month of ${variable} to (item ${firstArgIndex + 1} of argv) as integer`);
  expect(script).toContain(`set day of ${variable} to (item ${firstArgIndex + 2} of argv) as integer`);
  expect(script).toContain(`set hours of ${variable} to (item ${firstArgIndex + 3} of argv) as integer`);
  expect(script).toContain(`set minutes of ${variable} to (item ${firstArgIndex + 4} of argv) as integer`);
  expect(script).toContain(`set seconds of ${variable} to 0`);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  execFileSync.mockReturnValue(Buffer.from('created-id\n'));
  vi.spyOn(os, 'platform').mockReturnValue('darwin');
  vi.spyOn(requireCjs('child_process'), 'execFileSync').mockImplementation(execFileSync);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AppleScript values are passed through osascript argv', () => {
  describe('calendar_add', () => {
    it('constructs the expected fixed script and argv for normal input', async () => {
      const tool = (await import('../../src/tools/calendar_add.js')).default;
      const result = await tool.execute({
        title: 'Planning session', startDate: '2026-08-12 09:30', duration: 45,
        calendar: 'Work', notes: 'Bring roadmap', location: 'Room 4',
      });
      expect(result).toMatchObject({ success: true, eventId: 'created-id' });
      const { args, script } = invocationAt();
      expect(args).toEqual(['-', 'Planning session', '', '45', 'Work', 'Bring roadmap', 'Room 4', 'absolute', '0', 'minute', '2026', '8', '12', '9', '30']);
      expect(script).toContain('set eventTitle to item 1 of argv');
      expect(script).toContain('set newEvent to make new event');
      expect(script).toContain('if eventNotes is not ""');
      expect(script).not.toContain('date startDateValue');
      expectComponentDateConstruction(script, 'eventStartDate', 10);
    });

    it('keeps hostile title, calendar, notes, and location as literal argv items', async () => {
      const tool = (await import('../../src/tools/calendar_add.js')).default;
      const values = ['title ' + injection, 'calendar ' + injection, 'notes ' + injection, 'location ' + injection];
      expect((await tool.execute({ title: values[0], startDate: '2026-08-12 09:30', calendar: values[1], notes: values[2], location: values[3] })).success).toBe(true);
      expectDataOnlyInArgv(0, values);
    });

    it('rejects an invalid absolute date before invoking osascript', async () => {
      const tool = (await import('../../src/tools/calendar_add.js')).default;
      const result = await tool.execute({ title: 'Planning session', startDate: 'date ' + injection });
      expect(result).toEqual({ success: false, error: `Gecersiz startDate: "date ${injection}"` });
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('preserves the existing argv shape for now and relative dates', async () => {
      const tool = (await import('../../src/tools/calendar_add.js')).default;
      expect((await tool.execute({ title: 'Now' })).success).toBe(true);
      expect((await tool.execute({ title: 'Later', startDate: '+2 hours' })).success).toBe(true);
      expect(invocationAt(0).args).toEqual(['-', 'Now', 'now', '60', '', '', '', 'now', '0', 'minute']);
      expect(invocationAt(1).args).toEqual(['-', 'Later', '+2 hours', '60', '', '', '', 'relative', '2', 'hour']);
    });
  });

  describe('notes_add', () => {
    it('constructs the expected fixed script and argv for normal input', async () => {
      const tool = (await import('../../src/tools/notes_add.js')).default;
      expect((await tool.execute({ title: 'Trip plan', content: 'Day one\nDay two', folder: 'Travel' })).success).toBe(true);
      const { args, script } = invocationAt();
      expect(args).toEqual(['-', 'Trip plan', 'Day one\nDay two', 'Travel']);
      expect(script).toContain('set noteContent to item 2 of argv');
      expect(script).toContain('if folderName is not ""');
      expect(script).toContain('set targetFolder to folder folderName');
    });

    it('omits the invalid default folder reference when no folder is given', async () => {
      const tool = (await import('../../src/tools/notes_add.js')).default;
      expect((await tool.execute({ title: 'Inbox note', content: 'No folder' })).success).toBe(true);
      const { args, script } = invocationAt();
      expect(args).toEqual(['-', 'Inbox note', 'No folder', '']);
      expect(script).not.toContain('default folder');
      expect(script).toContain('set newNote to make new note with properties {name:noteTitle, body:noteContent}');
    });

    it('keeps hostile title, content, and folder as literal argv items', async () => {
      const tool = (await import('../../src/tools/notes_add.js')).default;
      const values = ['title ' + injection, 'content ' + injection, 'folder ' + injection];
      expect((await tool.execute({ title: values[0], content: values[1], folder: values[2] })).success).toBe(true);
      expectDataOnlyInArgv(0, values);
    });
  });

  describe('mac_alarm', () => {
    it('constructs both expected fixed scripts and argv arrays for normal input', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 23, 6, 0, 0));
      execFileSync.mockReturnValueOnce(Buffer.from('calendar-id\n')).mockReturnValueOnce(Buffer.from('reminder-id\n'));
      const tool = (await import('../../src/tools/mac_alarm.js')).default;
      expect((await tool.execute({ time: '07:00', label: 'Wake up' })).success).toBe(true);
      const calendar = invocationAt(0);
      const reminder = invocationAt(1);
      expect(calendar.args).toEqual(['-', 'Wake up', '2026', '6', '23', '7', '0']);
      expect(reminder.args.slice(0, 7)).toEqual(['-', 'Wake up', '2026', '6', '23', '7', '0']);
      expect(reminder.args[7]).toEqual(expect.any(String));
      expect(calendar.script).not.toContain('date alarmDate');
      expect(reminder.script).not.toContain('date alarmDate');
      expectComponentDateConstruction(calendar.script, 'startDate', 2);
      expectComponentDateConstruction(reminder.script, 'startDate', 2);
      expect(calendar.script).toContain('set eventSummary to "⏰ " & alarmLabel & " - NatureCo"');
      expect(reminder.script).toContain('set reminderName to "⏰ " & alarmLabel & " - NatureCo"');
    });

    it('keeps a hostile label as a literal argv item in both invocations', async () => {
      const tool = (await import('../../src/tools/mac_alarm.js')).default;
      const label = 'alarm ' + injection;
      expect((await tool.execute({ time: '2026-06-23 07:00', label })).success).toBe(true);
      expectDataOnlyInArgv(0, [label]);
      expectDataOnlyInArgv(1, [label]);
    });
  });

  describe('reminder_add', () => {
    it('constructs the expected fixed script and argv for normal input', async () => {
      const tool = (await import('../../src/tools/reminder_add.js')).default;
      expect((await tool.execute({ title: 'Submit report', notes: 'Attach charts', list: 'Work', dueDate: '2026-08-12 17:00' })).success).toBe(true);
      const { args, script } = invocationAt();
      expect(args).toEqual(['-', 'Submit report', 'Attach charts', 'Work', 'date', '', '2026', '8', '12', '17', '0']);
      expect(script).toContain('set reminderTitle to item 1 of argv');
      expect(script).toContain('if reminderNotes is not ""');
      expect(script).not.toContain('date dueDateValue');
      expectComponentDateConstruction(script, 'reminderDueDate', 6);
    });

    it('keeps hostile title, notes, and list as literal argv items', async () => {
      const tool = (await import('../../src/tools/reminder_add.js')).default;
      const values = ['title ' + injection, 'notes ' + injection, 'list ' + injection];
      expect((await tool.execute({ title: values[0], notes: values[1], list: values[2], dueDate: '2026-08-12 17:00' })).success).toBe(true);
      expectDataOnlyInArgv(0, values);
    });

    it('rejects an invalid absolute due date before invoking osascript', async () => {
      const tool = (await import('../../src/tools/reminder_add.js')).default;
      const result = await tool.execute({ title: 'Submit report', dueDate: 'date ' + injection });
      expect(result).toEqual({ success: false, error: `Gecersiz dueDate: "date ${injection}"` });
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('preserves today and unset due-date argv behavior', async () => {
      const tool = (await import('../../src/tools/reminder_add.js')).default;
      expect((await tool.execute({ title: 'Today', dueDate: 'today' })).success).toBe(true);
      expect((await tool.execute({ title: 'Someday' })).success).toBe(true);
      expect(invocationAt(0).args).toEqual(['-', 'Today', '', '', 'today', 'today']);
      expect(invocationAt(1).args).toEqual(['-', 'Someday', '', '', 'none', '']);
    });
  });

  describe('mac_notify', () => {
    it('constructs the expected fixed script and argv for normal input', async () => {
      const tool = (await import('../../src/tools/mac_notify.js')).default;
      expect((await tool.execute({ title: 'Build complete', message: 'All checks passed', subtitle: 'NatureCo' })).success).toBe(true);
      const { args, script } = invocationAt();
      expect(args).toEqual(['-', 'Build complete', 'All checks passed', 'NatureCo']);
      expect(script).toContain('display notification notificationMessage with title notificationTitle');
      expect(script).toContain('if notificationSubtitle is not ""');
    });

    it('keeps hostile title, message, and subtitle as literal argv items', async () => {
      const tool = (await import('../../src/tools/mac_notify.js')).default;
      const values = ['title ' + injection, 'message ' + injection, 'subtitle ' + injection];
      expect((await tool.execute({ title: values[0], message: values[1], subtitle: values[2] })).success).toBe(true);
      expectDataOnlyInArgv(0, values);
    });
  });

  describe('mac_app_quit', () => {
    it('constructs the expected fixed script and argv for normal input', async () => {
      const tool = (await import('../../src/tools/mac_app_quit.js')).default;
      expect((await tool.execute({ appName: 'Safari' })).success).toBe(true);
      const { args, script } = invocationAt();
      expect(args).toEqual(['-', 'Safari']);
      expect(script).toContain('set appName to item 1 of argv');
      expect(script).toContain('tell application appName to quit');
    });

    it('keeps a hostile application name as a literal argv item', async () => {
      const tool = (await import('../../src/tools/mac_app_quit.js')).default;
      const appName = 'Safari ' + injection;
      expect((await tool.execute({ appName })).success).toBe(true);
      expectDataOnlyInArgv(0, [appName]);
    });
  });
});
