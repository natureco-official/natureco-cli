const chalk = require('chalk');
const { spawnSync } = require('child_process');
const { t } = require('../utils/i18n');

/**
 * `natureco dna [path]` — CodeDNA ile kod şeffaflığı.
 *
 * Ekosistem entegrasyonu: NatureCo CLI, yazılan/incelenen kodun "DNA"sını
 * (ne kadarı yapay zekâ olası, anlama skoru) CodeDNA aracıyla raporlar.
 * CodeDNA'yı `codedna scan --json` ile çağırıp özetini gösterir.
 *
 * Gereksinim: CodeDNA kurulu olmalı → `pip install codedna` (veya `uv tool install codedna`).
 */
async function dna(pathArg, opts = {}) {
  const target = pathArg || process.cwd();

  // codedna'yı bul (PATH'te). Kurulu değilse yönlendir.
  const args = ['scan', '--json', '--repo', target];
  if (opts.max) args.push('--max', String(opts.max));

  const res = spawnSync('codedna', args, { encoding: 'utf8' });

  if (res.error && res.error.code === 'ENOENT') {
    console.log('');
    console.log(chalk.yellow('  ' + t('dna.notInstalled')));
    console.log(chalk.gray('  ' + t('dna.installHint') + '  ') + chalk.cyan('pip install codedna') + chalk.gray('  (uv tool install codedna)'));
    console.log(chalk.gray('  ' + t('dna.installDesc') + '\n'));
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(res.stdout);
  } catch (_e) {
    console.log(chalk.red('  ' + t('dna.unreadable')));
    if (res.stderr) console.log(chalk.gray(res.stderr.trim().split('\n').slice(0, 4).join('\n')));
    process.exitCode = 1;
    return;
  }

  const pct = Math.round((data.avg_ai_probability || 0) * 100);
  const maxPct = Math.round((data.max_ai_probability || 0) * 100);
  const bar = (p) => {
    const n = Math.round(p / 5);
    return '█'.repeat(n) + '░'.repeat(20 - n);
  };
  const tone = (p) => (p >= 60 ? chalk.red : p >= 30 ? chalk.yellow : chalk.green);

  console.log('');
  console.log('  ' + chalk.bold.cyan('🧬 CodeDNA') + chalk.gray('  ·  ' + (data.repo || target)));
  console.log('');
  const pad = (s) => (s + '                      ').slice(0, 22);
  console.log('  ' + chalk.gray(pad(t('dna.avgAi'))) + tone(pct)(bar(pct)) + '  ' + tone(pct).bold(`%${pct}`));
  console.log('  ' + chalk.gray(pad(t('dna.maxFile'))) + tone(maxPct)(bar(maxPct)) + '  ' + tone(maxPct).bold(`%${maxPct}`));
  console.log('  ' + chalk.gray(t('dna.scanned', { n: data.file_count || 0 })));
  console.log('');

  // Anlama skoru (1-5): anket varsa onu, yoksa otomatik tahmini kullan
  const uScore = (f) => (f.understanding != null ? f.understanding : f.understanding_estimate);
  const uCol = (v) => (v >= 4 ? chalk.green : v >= 2.5 ? chalk.yellow : chalk.red);

  // En yüksek YZ olasılıklı 5 dosya
  const top = (data.files || []).slice(0, 5);
  if (top.length) {
    console.log('  ' + chalk.gray(t('dna.topFiles')));
    for (const f of top) {
      const fp = Math.round((f.ai_probability || 0) * 100);
      const uv = uScore(f);
      const u = uv == null ? '' : '  ' + uCol(uv)(`${t('dna.understanding')} ${uv.toFixed(1)}/5`);
      console.log('    ' + tone(fp).bold(`%${String(fp).padStart(3)}`) + '  ' + chalk.white(f.file) + u);
    }
    console.log('');
  }

  // 🧠 Anlama borcu — AI-yoğun ama az-anlaşılan dosyalar (farklılaştırıcı)
  const debt = (data.files || [])
    .filter((f) => { const v = uScore(f); return v != null && v < 3 && (f.ai_probability || 0) >= 0.3; })
    .sort((a, b) => uScore(a) - uScore(b))
    .slice(0, 5);
  if (debt.length) {
    console.log('  ' + chalk.bold(t('dna.debtTitle')) + chalk.gray(' ' + t('dna.debtDesc')));
    for (const f of debt) {
      console.log('    ' + chalk.red(`${uScore(f).toFixed(1)}/5`) + '  ' + chalk.white(f.file) + chalk.gray(`  (AI %${Math.round(f.ai_probability * 100)})`));
    }
    console.log('');
  }
  console.log(chalk.gray('  ' + t('dna.detail') + ' ') + chalk.cyan('codedna scan') + chalk.gray('  ·  ' + t('dna.ecosystem') + ' ') + chalk.cyan('natureco.me/ekosistem') + '\n');
}

module.exports = dna;
