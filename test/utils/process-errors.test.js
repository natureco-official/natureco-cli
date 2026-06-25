/**
 * Top-level process error handlers (unhandledRejection + uncaughtException).
 *
 * These tests inject fake `audit`, `exit`, and `stderr` so we can observe
 * the handler's behavior without actually killing the test runner.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const procErr = require('../../src/utils/process-errors');

let uninstall;
let auditMock;
let exitMock;
let stderrMock;

beforeEach(() => {
  auditMock = { logSync: vi.fn(), ACTIONS: {} };
  exitMock = vi.fn();
  stderrMock = vi.fn();
  uninstall = procErr.install({ audit: auditMock, exit: exitMock, stderr: stderrMock });
});

afterEach(() => {
  if (uninstall) uninstall();
  uninstall = null;
});

describe('install', () => {
  it('marks as installed and returns an uninstall function', () => {
    expect(procErr.isInstalled()).toBe(true);
    expect(typeof uninstall).toBe('function');
  });

  it('is idempotent: a second install replaces the first handlers', () => {
    const exit2 = vi.fn();
    const stderr2 = vi.fn();
    const un2 = procErr.install({ audit: auditMock, exit: exit2, stderr: stderr2 });
    process.emit('unhandledRejection', new Error('test'));
    // Only the second install's handlers fire
    expect(exitMock).not.toHaveBeenCalled();
    expect(exit2).toHaveBeenCalledWith(1);
    un2();
  });

  it('uninstall actually removes the handlers', () => {
    // After install there's exactly one listener registered. After
    // uninstall there's zero — verified via listenerCount to avoid
    // emitting a real unhandledRejection that would leak past the test.
    expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
    expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
    const before = {
      r: process.listenerCount('unhandledRejection'),
      e: process.listenerCount('uncaughtException'),
    };
    uninstall();
    uninstall = null;
    expect(process.listenerCount('unhandledRejection')).toBe(before.r - 1);
    expect(process.listenerCount('uncaughtException')).toBe(before.e - 1);
  });
});

describe('unhandledRejection handler', () => {
  it('logs an audit entry, prints to stderr, and exits 1', () => {
    process.emit('unhandledRejection', new Error('async boom'));
    expect(auditMock.logSync).toHaveBeenCalledOnce();
    const [, payload] = auditMock.logSync.mock.calls[0];
    expect(payload.kind).toBe('unhandledRejection');
    expect(payload.error.message).toBe('async boom');
    expect(payload.error.type).toBe('Error');
    expect(stderrMock).toHaveBeenCalledOnce();
    expect(stderrMock.mock.calls[0][0]).toMatch(/unhandled promise rejection/);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('handles non-Error rejection reasons gracefully (string, undefined)', () => {
    process.emit('unhandledRejection', 'just a string');
    expect(auditMock.logSync).toHaveBeenCalledOnce();
    expect(auditMock.logSync.mock.calls[0][1].error.message).toBe('just a string');

    process.emit('unhandledRejection', undefined);
    expect(auditMock.logSync).toHaveBeenCalledTimes(2);
    expect(auditMock.logSync.mock.calls[1][1].error.message).toBe('null');
  });

  it('continues to exit even when audit.logSync throws', () => {
    auditMock.logSync.mockImplementation(() => { throw new Error('audit broken'); });
    process.emit('unhandledRejection', new Error('boom'));
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderrMock).toHaveBeenCalled();
  });
});

describe('uncaughtException handler', () => {
  it('logs an audit entry, prints to stderr, and exits 1', () => {
    process.emit('uncaughtException', new Error('sync boom'));
    expect(auditMock.logSync).toHaveBeenCalledOnce();
    expect(auditMock.logSync.mock.calls[0][1].kind).toBe('uncaughtException');
    expect(stderrMock.mock.calls[0][0]).toMatch(/uncaught exception/);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('works when audit is explicitly null (no audit module available)', () => {
    uninstall();
    uninstall = procErr.install({ audit: null, exit: exitMock, stderr: stderrMock });
    process.emit('uncaughtException', new Error('boom'));
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderrMock).toHaveBeenCalled();
  });
});

describe('_serializeError', () => {
  const { _serializeError } = procErr._internals;
  it('captures Error fields and trims stack to 20 lines', () => {
    const err = new Error('x');
    err.code = 'E_X';
    const out = _serializeError(err);
    expect(out).toMatchObject({ type: 'Error', message: 'x', code: 'E_X' });
    expect(out.stack.split('\n').length).toBeLessThanOrEqual(20);
  });
  it('handles plain object via JSON.stringify (truncated)', () => {
    const out = _serializeError({ foo: 'bar' });
    expect(out.type).toBe('object');
    expect(out.message).toBe('{"foo":"bar"}');
  });
  it('handles primitives via String()', () => {
    expect(_serializeError(42).message).toBe('42');
    expect(_serializeError('oops').message).toBe('oops');
  });
  it('handles null safely', () => {
    expect(_serializeError(null).message).toBe('null');
  });
});
