/**
 * natureco cost — Maliyet takibi ve bütçe yönetimi (Phase 4)
 *
 * Kullanım:
 *   natureco cost                  Bugünün maliyetini göster
 *   natureco cost today            Bugünkü maliyet
 *   natureco cost week             Bu haftaki maliyet
 *   natureco cost month            Bu ayki maliyet
 *   natureco cost all              Tüm zamanlar
 *   natureco cost budget           Bütçe durumu ve uyarılar
 *   natureco cost set <key> <val>  Bütçe ayarla (dailyLimit 5, monthlyLimit 100, warnAt 0.75)
 *   natureco cost model <prompt>   Bir prompt için önerilen modeli göster
 *   natureco cost prices           Tüm fiyatları listele
 */

const chalk = require('chalk');
const tui = require('../utils/tui');
const cost = require('../utils/cost-tracker');
const audit = require('../utils/audit');

function showPeriod(period) {
  const data = cost.totalForPeriod(period);
  const icon = { today: '📅', week: '📆', month: '🗓️', all: '♾️ ' }[period] || '💰';
  console.log(tui.styled(`\n  ${icon} Maliyet Raporu · ${period.toUpperCase()}`, { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Üst metrik kartı
  const cardWidth = 54;
  const cardLines = [];
  cardLines.push(tui.styled('  ╭' + '─'.repeat(cardWidth) + '╮', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  │', { color: tui.PALETTE.border }) + ' ' + tui.C.muted('Toplam maliyet:') + ' ' + tui.styled(cost.formatUSD(data.totalCost).padStart(12), { color: tui.PALETTE.primary, bold: true }) + ' ' + tui.styled('│', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  │', { color: tui.PALETTE.border }) + ' ' + tui.C.muted('Toplam token:') + '   ' + tui.C.text((data.totalInput + data.totalOutput).toLocaleString().padStart(8) + ` (${data.totalInput.toLocaleString()} in / ${data.totalOutput.toLocaleString()} out)`) + ' ' + tui.styled('│', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  │', { color: tui.PALETTE.border }) + ' ' + tui.C.muted('Çağrı sayısı:') + '   ' + tui.C.text(String(data.entries).padStart(8)) + ' ' + tui.styled('│', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  ╰' + '─'.repeat(cardWidth) + '╯', { color: tui.PALETTE.border }));
  console.log(cardLines.join('\n'));

  if (Object.keys(data.byProvider).length > 0) {
    console.log('\n' + tui.styled('  💵 Provider Bazlı Maliyet', { color: tui.PALETTE.secondary, bold: true }));
    const providerRows = Object.entries(data.byProvider)
      .sort((a, b) => b[1] - a[1])
      .map(([provider, amount]) => ({
        provider,
        amount: cost.formatUSD(amount),
        pct: tui.progressBar(amount / Math.max(0.01, data.totalCost), 1, { width: 20, showPercent: false }),
      }));
    console.log('\n' + tui.table(providerRows, [
      { key: 'provider', label: 'Provider', minWidth: 12 },
      { key: 'amount', label: 'Maliyet', minWidth: 10, render: r => tui.C.brand(r.amount) },
      { key: 'pct', label: 'Dağılım', minWidth: 20, render: r => tui.styled(r.pct, { color: tui.PALETTE.primary }) },
    ], { borderStyle: 'round', zebra: true }));
  }

  if (Object.keys(data.byModel).length > 0) {
    console.log('\n' + tui.styled('  🤖 Model Bazlı Maliyet (Top 5)', { color: tui.PALETTE.accent, bold: true }));
    const sortedModels = Object.entries(data.byModel).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const modelRows = sortedModels.map(([model, amount]) => ({
      model,
      amount: cost.formatUSD(amount),
    }));
    console.log('\n' + tui.table(modelRows, [
      { key: 'model', label: 'Model', minWidth: 40, render: r => tui.C.muted(r.model) },
      { key: 'amount', label: 'Maliyet', minWidth: 10, render: r => tui.C.brand(r.amount) },
    ], { borderStyle: 'round', zebra: true }));
  }
  console.log('');
}

function showBudget() {
  const status = cost.checkBudget();
  const budget = cost.loadBudget();

  console.log('\n' + tui.styled('  🛡️  Bütçe Durumu', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Günlük
  const dailyBar = tui.progressBar(status.daily.usage, 1, {
    width: 25, showPercent: true,
    fillChar: status.daily.exceeded ? '▓' : status.daily.warning ? '▒' : '█',
  });
  const dailyColor = status.daily.exceeded ? tui.PALETTE.danger : status.daily.warning ? tui.PALETTE.warning : tui.PALETTE.success;
  console.log(`\n  ${tui.C.muted('Günlük limit')}    ${tui.C.brand(cost.formatUSD(budget.dailyLimit).padStart(10))}  ${tui.styled(dailyBar, { color: dailyColor })}`);
  if (status.daily.exceeded) console.log('  ' + tui.styled('⚠️  Günlük limit aşıldı!', { color: tui.PALETTE.danger, bold: true }));
  else if (status.daily.warning) console.log('  ' + tui.styled(`⚠️  %${(budget.warnAt * 100)} eşiğine yaklaşıldı`, { color: tui.PALETTE.warning }));

  console.log('');

  // Aylık
  const monthlyBar = tui.progressBar(status.monthly.usage, 1, {
    width: 25, showPercent: true,
    fillChar: status.monthly.exceeded ? '▓' : status.monthly.warning ? '▒' : '█',
  });
  const monthlyColor = status.monthly.exceeded ? tui.PALETTE.danger : status.monthly.warning ? tui.PALETTE.warning : tui.PALETTE.success;
  console.log(`  ${tui.C.muted('Aylık limit')}     ${tui.C.brand(cost.formatUSD(budget.monthlyLimit).padStart(10))}  ${tui.styled(monthlyBar, { color: monthlyColor })}`);
  if (status.monthly.exceeded) console.log('  ' + tui.styled('⚠️  Aylık limit aşıldı!', { color: tui.PALETTE.danger, bold: true }));
  else if (status.monthly.warning) console.log('  ' + tui.styled(`⚠️  %${(budget.warnAt * 100)} eşiğine yaklaşıldı`, { color: tui.PALETTE.warning }));

  if (status.shouldDowngrade) {
    console.log('\n' + tui.styled('  ⬇️  Otomatik downgrade önerilir — basit soruları ucuz modele yönlendir.', { color: tui.PALETTE.warning, bold: true }));
  }

  console.log('\n' + tui.C.muted('  Ayarlamak için: ') + tui.C.brand('natureco cost set <key> <value>'));
  console.log('');
}

function setBudget(args) {
  const [key, value] = args;
  if (!key || value === undefined) {
    console.log(chalk.red('\n  Kullanım: natureco cost set <key> <value>\n'));
    console.log(chalk.gray('  Anahtarlar: dailyLimit, monthlyLimit, warnAt, downgradeAt'));
    console.log(chalk.gray('  Örnek:     natureco cost set dailyLimit 3.00'));
    console.log('');
    return;
  }
  const budget = cost.loadBudget();
  const num = parseFloat(value);
  if (isNaN(num) && key !== 'preset') {
    console.log(chalk.red(`\n  Geçersiz sayı: ${value}\n`));
    return;
  }
  budget[key] = num;
  cost.saveBudget(budget);
  console.log(chalk.green(`\n  ✓ ${key} = ${value}\n`));
  audit.log(audit.ACTIONS.CONFIG_CHANGE, { source: 'cost', key, value });
}

function suggestModel(args) {
  const prompt = args.join(' ');
  if (!prompt) {
    console.log(chalk.red('\n  Kullanım: natureco cost model "<prompt>"\n'));
    return;
  }
  const suggestion = cost.suggestModel(prompt);
  if (!suggestion) return;

  console.log(chalk.bold('\n  🎯 Model Önerisi\n'));
  console.log(chalk.gray('  Prompt karmaşıklığı: ') + chalk.cyan(suggestion.complexity));
  console.log(chalk.gray(`  ${cost.ROUTING[suggestion.complexity].description}\n`));
  console.log(chalk.gray('  Önerilen model: ') + chalk.bold(`${suggestion.provider}:${suggestion.model}`));
  console.log(chalk.gray('  Neden: ') + chalk.gray(suggestion.reason));

  const pricing = cost.getPricing(suggestion.provider, suggestion.model);
  console.log(chalk.gray('  Fiyat: ') + chalk.cyan(`${cost.formatUSD(pricing.input)} in / ${cost.formatUSD(pricing.output)} out (per 1M)`));

  if (suggestion.optimal) {
    console.log(chalk.green('\n  ✓ Mevcut model zaten optimal.\n'));
  } else {
    console.log(chalk.yellow('\n  ⚠️  Mevcut model optimal değil. Değiştirmek için:'));
    console.log(chalk.cyan(`     natureco config set providerUrl <url>`));
    console.log(chalk.cyan(`     natureco config set providerModel ${suggestion.model}`));
    console.log('');
  }
}

function showPrices() {
  console.log(chalk.bold('\n  💵 Model Fiyatları (USD / 1M token)\n'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  // Provider'lara göre grupla
  const grouped = {};
  for (const [key, price] of Object.entries(cost.PRICING)) {
    const [provider] = key.split(':');
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push({ model: key.slice(provider.length + 1), ...price });
  }

  for (const [provider, models] of Object.entries(grouped)) {
    console.log(chalk.bold(`\n  ${provider.toUpperCase()}`));
    for (const m of models) {
      const inPrice = m.input === 0 ? chalk.green('ücretsiz') : cost.formatUSD(m.input);
      const outPrice = m.output === 0 ? chalk.green('ücretsiz') : cost.formatUSD(m.output);
      console.log(`    ${m.model.padEnd(40)} ${inPrice.padStart(10)} in  ${outPrice.padStart(10)} out`);
    }
  }
  console.log('');
}

function cost_cmd(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'today') {
    showPeriod('today');
    return;
  }

  if (action === 'week') { showPeriod('week'); return; }
  if (action === 'month') { showPeriod('month'); return; }
  if (action === 'all') { showPeriod('all'); return; }

  if (action === 'budget') { showBudget(); return; }

  if (action === 'set') { setBudget(params); return; }

  if (action === 'model') { suggestModel(params); return; }

  if (action === 'prices') { showPrices(); return; }

  // Yardım
  console.log(chalk.yellow('\n  Kullanım:'));
  console.log(chalk.gray('    natureco cost                  Bugünün maliyeti'));
  console.log(chalk.gray('    natureco cost week             Bu hafta'));
  console.log(chalk.gray('    natureco cost month            Bu ay'));
  console.log(chalk.gray('    natureco cost all              Tüm zamanlar'));
  console.log(chalk.gray('    natureco cost budget           Bütçe durumu'));
  console.log(chalk.gray('    natureco cost set <k> <v>      Bütçe ayarla'));
  console.log(chalk.gray('    natureco cost model "<p>"      Model önerisi'));
  console.log(chalk.gray('    natureco cost prices           Fiyat listesi'));
  console.log('');
}

module.exports = cost_cmd;
