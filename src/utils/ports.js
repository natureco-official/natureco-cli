/**
 * Centralized port + host defaults with env-var overrides.
 *
 * Hardcoding `7421` across multiple modules invited "port already in use"
 * crashes in environments where the user runs natureco alongside other
 * services on that port, or wants to run multiple natureco dashboards
 * (e.g. one per project worktree). This module is the single source of
 * truth — set NATURECO_DASHBOARD_PORT / NATURECO_DASHBOARD_HOST once and
 * all callers pick it up.
 */

const DEFAULT_DASHBOARD_PORT = 7421;
const DEFAULT_DASHBOARD_HOST = '127.0.0.1';

function _parsePort(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(String(raw).trim(), 10);
  // Bind to a reserved port (≤1024) usually fails and is almost never
  // what the user meant; clamp out-of-range values to the default.
  if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback;
  return n;
}

function getDashboardPort() {
  return _parsePort(process.env.NATURECO_DASHBOARD_PORT, DEFAULT_DASHBOARD_PORT);
}

function getDashboardHost() {
  const raw = process.env.NATURECO_DASHBOARD_HOST;
  return (raw && String(raw).trim()) || DEFAULT_DASHBOARD_HOST;
}

function getDashboardUrl() {
  return `http://${getDashboardHost()}:${getDashboardPort()}`;
}

module.exports = {
  DEFAULT_DASHBOARD_PORT,
  DEFAULT_DASHBOARD_HOST,
  getDashboardPort,
  getDashboardHost,
  getDashboardUrl,
  _internals: { _parsePort },
};
