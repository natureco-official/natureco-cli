const chalk = require('chalk');
const { spawnSync } = require('child_process');

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
    console.log(chalk.yellow('  CodeDNA kurulu değil.'));
    console.log(chalk.gray('  Kurmak için:  ') + chalk.cyan('pip install codedna') + chalk.gray('  (veya ') + chalk.cyan('uv tool install codedna') + chalk.gray(')'));
    console.log(chalk.gray('  CodeDNA, kodun ne kadarının yapay zekâ olduğunu ölçen NatureCo aracıdır.\n'));
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(res.stdout);
  } catch (_e) {
    console.log(chalk.red('  CodeDNA çıktısı okunamadı.'));
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
  console.log('  ' + chalk.gray('Ortalama YZ olasılığı  ') + tone(pct)(bar(pct)) + '  ' + tone(pct).bold(`%${pct}`));
  console.log('  ' + chalk.gray('En yüksek dosya        ') + tone(maxPct)(bar(maxPct)) + '  ' + tone(maxPct).bold(`%${maxPct}`));
  console.log('  ' + chalk.gray(`Taranan dosya: ${data.file_count || 0}`));
  console.log('');

  // En yüksek YZ olasılıklı 5 dosya
  const top = (data.files || []).slice(0, 5);
  if (top.length) {
    console.log('  ' + chalk.gray('En yüksek YZ olasılıklı dosyalar:'));
    for (const f of top) {
      const fp = Math.round((f.ai_probability || 0) * 100);
      const u = f.understanding == null ? '' : chalk.gray(`  anlama %${Math.round(f.understanding * 100)}`);
      console.log('    ' + tone(fp).bold(`%${String(fp).padStart(3)}`) + '  ' + chalk.white(f.file) + u);
    }
    console.log('');
  }
  console.log(chalk.gray('  Ayrıntı için: ') + chalk.cyan('codedna scan') + chalk.gray('  ·  Ekosistem: ') + chalk.cyan('natureco.me/ekosistem') + '\n');
}

module.exports = dna;
