/**
 * Centralized port/host config with env overrides.
 * Replaces 7421 hardcodes in dashboard.js + dashboard-server.js.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let mod;
const ENV_KEYS = ['NATURECO_DASHBOARD_PORT', 'NATURECO_DASHBOARD_HOST'];
const saved = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  delete require.cache[require.resolve('../../src/utils/ports')];
  mod = require('../../src/utils/ports');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('getDashboardPort', () => {
  it('defaults to 7421 when env unset', () => {
    expect(mod.getDashboardPort()).toBe(7421);
  });

  it('respects NATURECO_DASHBOARD_PORT when valid', () => {
    process.env.NATURECO_DASHBOARD_PORT = '9999';
    expect(mod.getDashboardPort()).toBe(9999);
  });

  it('trims whitespace from the env value', () => {
    process.env.NATURECO_DASHBOARD_PORT = '  8080  ';
    expect(mod.getDashboardPort()).toBe(8080);
  });

  it('falls back to default on out-of-range values (0, 65536, negative)', () => {
    for (const bad of ['0', '65536', '-1', '99999']) {
      process.env.NATURECO_DASHBOARD_PORT = bad;
      expect(mod.getDashboardPort()).toBe(7421);
    }
  });

  it('falls back to default on non-numeric values', () => {
    process.env.NATURECO_DASHBOARD_PORT = 'banana';
    expect(mod.getDashboardPort()).toBe(7421);
  });

  it('falls back to default on empty string', () => {
    process.env.NATURECO_DASHBOARD_PORT = '';
    expect(mod.getDashboardPort()).toBe(7421);
  });
});

describe('getDashboardHost', () => {
  it('defaults to 127.0.0.1', () => {
    expect(mod.getDashboardHost()).toBe('127.0.0.1');
  });

  it('respects NATURECO_DASHBOARD_HOST when set', () => {
    process.env.NATURECO_DASHBOARD_HOST = '0.0.0.0';
    expect(mod.getDashboardHost()).toBe('0.0.0.0');
  });

  it('trims whitespace', () => {
    process.env.NATURECO_DASHBOARD_HOST = '  127.0.0.1  ';
    expect(mod.getDashboardHost()).toBe('127.0.0.1');
  });

  it('falls back to default on empty/whitespace-only', () => {
    process.env.NATURECO_DASHBOARD_HOST = '   ';
    expect(mod.getDashboardHost()).toBe('127.0.0.1');
  });
});

describe('getDashboardUrl', () => {
  it('composes from host + port', () => {
    expect(mod.getDashboardUrl()).toBe('http://127.0.0.1:7421');
  });

  it('reflects env overrides', () => {
    process.env.NATURECO_DASHBOARD_HOST = '0.0.0.0';
    process.env.NATURECO_DASHBOARD_PORT = '3000';
    expect(mod.getDashboardUrl()).toBe('http://0.0.0.0:3000');
  });
});
