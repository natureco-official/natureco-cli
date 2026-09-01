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

/**
 * Yorumlayıcı taban çizgisi: hiçbir şey yapmayan bir Node süreci.
 *
 * Kapı mutlak duvar saatini ölçüyordu, ama o sürenin büyük kısmı Node'un kendi
 * süreç başlangıcı. Ölçüldü (Windows, yüklü makine): boş `node -e ''` 86,8ms,
 * `natureco --version` 95,5ms — yani 100ms bütçenin %87'si yorumlayıcıya
 * gidiyor ve CLI'ye 13ms kalıyor. Makine yükü tek başına ölçümü 102–115ms
 * arasında gezdiriyor, dolayısıyla kapı kodu değil donanımı ölçüyordu.
 *
 * Bu blok ölçütü, kapının KORUMAK İSTEDİĞİ şeye çeviriyor: hızlı yolun
 * Commander'ı ve ~100 komut modülünü yüklememesi. Ölçülen artık CLI'nin KENDİ
 * ek yükü (bizimki − boş Node). Bu, makineden ve Node sürümünden bağımsız ve
 * hızlı yola bir `require` eklenirse yine düşer.
 */
function measureBaseline(runs = 7) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = process.hrtime.bigint();
    const result = spawnSync(process.execPath, ['-e', '0'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`baseline failed: ${result.stderr}`);
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return { min: samples[0], median: samples[Math.floor(samples.length / 2)] };
}

// CLI'nin kendi ek yükü için bütçeler.
//
// Sınırlar ölçümle belirlendi, tahminle değil. Hızlı yola `commander` ve
// `chalk` require'ları kasten eklenip ayrım ölçüldü:
//   temiz           -> --version ek yükü 7–13ms (makine yüküne göre)
//   regresyonlu     -> 29ms
// 22ms bu ikisinin arasında: gerçek bir regresyonu yakalar, gürültüde
// yanlış alarm vermez. Bütçe gevşetilecekse önce bu ölçüm tekrarlanmalı.
const VERSION_OVERHEAD_BUDGET_MS = 22;
const HELP_OVERHEAD_BUDGET_MS = 220;

const baseline = measureBaseline();
const version = measure(['--version']);
const help = measure(['help'], 5);

const versionOverhead = version.median - baseline.median;
const helpOverhead = help.median - baseline.median;

const report = {
  timestamp: new Date().toISOString(), node: process.version, platform: process.platform,
  baseline, version, help,
  overhead: { version: versionOverhead, help: helpOverhead },
};
console.log(JSON.stringify(report, null, 2));

if (versionOverhead >= VERSION_OVERHEAD_BUDGET_MS) {
  console.error(`--version CLI ek yuku ${versionOverhead.toFixed(1)}ms, butce ${VERSION_OVERHEAD_BUDGET_MS}ms `
    + `(mutlak ${version.median.toFixed(1)}ms, bos Node ${baseline.median.toFixed(1)}ms)`);
  process.exitCode = 1;
}
if (helpOverhead >= HELP_OVERHEAD_BUDGET_MS) {
  console.error(`help CLI ek yuku ${helpOverhead.toFixed(1)}ms, butce ${HELP_OVERHEAD_BUDGET_MS}ms `
    + `(mutlak ${help.median.toFixed(1)}ms, bos Node ${baseline.median.toFixed(1)}ms)`);
  process.exitCode = 1;
}
