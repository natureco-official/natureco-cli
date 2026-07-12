'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const bin = path.join(__dirname, '..', 'bin', 'natureco.js');
function measure(args, runs = 7) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NATURECO_NO_UPDATE_CHECK: '1', FORCE_COLOR: '0' } });
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (result.status !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr}`);
    samples.push(durationMs);
  }
  samples.sort((a, b) => a - b);
  return { min: samples[0], median: samples[Math.floor(samples.length / 2)], p95: samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)], samples };
}

const version = measure(['--version']);
const report = { timestamp: new Date().toISOString(), node: process.version, platform: process.platform, version };
console.log(JSON.stringify(report, null, 2));
if (version.median >= 100) {
  console.error(`--version median ${version.median.toFixed(1)}ms exceeds 100ms target`);
  process.exitCode = 1;
}
