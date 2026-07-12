'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

function checkPidFile(pidFile, processKill = process.kill) {
  if (!fs.existsSync(pidFile)) return { ok: false, status: 'stopped', reason: 'pid-file-missing' };
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) return { ok: false, status: 'invalid', reason: 'invalid-pid' };
  try { processKill(pid, 0); return { ok: true, status: 'running', pid }; }
  catch { return { ok: false, status: 'stale', reason: 'process-not-running', pid }; }
}

function checkDockerContainer(name = 'natureco-sandbox', execFile = execFileSync) {
  try {
    const output = execFile('docker', ['inspect', '--format', '{{json .State}}', name], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    const state = JSON.parse(output.trim());
    return { ok: state.Running === true && state.Health?.Status !== 'unhealthy', status: state.Health?.Status || (state.Running ? 'running' : 'stopped'), running: !!state.Running, restartCount: state.RestartCount || 0 };
  } catch (error) { return { ok: false, status: 'unavailable', reason: error.code === 'ENOENT' ? 'docker-not-installed' : 'container-not-found' }; }
}

function aggregateRuntimeHealth(parts) {
  const entries = Object.entries(parts || {});
  const failed = entries.filter(([, value]) => !value?.ok).map(([name]) => name);
  return { ok: failed.length === 0, status: failed.length === 0 ? 'healthy' : failed.length === entries.length ? 'down' : 'degraded', failed, checks: parts };
}

module.exports = { checkPidFile, checkDockerContainer, aggregateRuntimeHealth };
