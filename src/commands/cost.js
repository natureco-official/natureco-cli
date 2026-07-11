/**
 * natureco cost — cost tracking and budget management (Phase 4)
 *
 * Usage:
 *   natureco cost                  Show today's cost
 *   natureco cost today            Today's cost
 *   natureco cost week             This week's cost
 *   natureco cost month            This month's cost
 *   natureco cost all              All time
 *   natureco cost budget           Budget status and warnings
 *   natureco cost set <key> <val>  Set a budget (dailyLimit 5, monthlyLimit 100, warnAt 0.75)
 *   natureco cost model <prompt>   Show the suggested model for a prompt
 *   natureco cost prices           List all prices
 */

const chalk = require('chalk');
const tui = require('../utils/tui');
const cost = require('../utils/cost-tracker');
const audit = require('../utils/audit');
const { getLang } = require('../utils/i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

function showPeriod(period) {
  const data = cost.totalForPeriod(period);
  const icon = { today: '📅', week: '📆', month: '🗓️', all: '♾️ ' }[period] || '💰';
  console.log(tui.styled(`\n  ${icon} ${L('Maliyet Raporu', 'Cost Report')} · ${period.toUpperCase()}`, { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Top metric card
  const cardWidth = 54;
  const cardLines = [];
  cardLines.push(tui.styled('  ╭' + '─'.repeat(cardWidth) + '╮', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  │', { color: tui.PALETTE.border }) + ' ' + tui.C.muted(L('Toplam maliyet:', 'Total cost:')) + ' ' + tui.styled(cost.formatUSD(data.totalCost).padStart(12), { color: tui.PALETTE.primary, bold: true }) + ' ' + tui.styled('│', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  │', { color: tui.PALETTE.border }) + ' ' + tui.C.muted(L('Toplam token:', 'Total tokens:')) + '   ' + tui.C.text((data.totalInput + data.totalOutput).toLocaleString().padStart(8) + ` (${data.totalInput.toLocaleString()} in / ${data.totalOutput.toLocaleString()} out)`) + ' ' + tui.styled('│', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  │', { color: tui.PALETTE.border }) + ' ' + tui.C.muted(L('Çağrı sayısı:', 'Calls:')) + '   ' + tui.C.text(String(data.entries).padStart(8)) + ' ' + tui.styled('│', { color: tui.PALETTE.border }));
  cardLines.push(tui.styled('  ╰' + '─'.repeat(cardWidth) + '╯', { color: tui.PALETTE.border }));
  console.log(cardLines.join('\n'));

  if (Object.keys(data.byProvider).length > 0) {
    console.log('\n' + tui.styled('  💵 ' + L('Provider Bazlı Maliyet', 'Cost by Provider'), { color: tui.PALETTE.secondary, bold: true }));
    const providerRows = Object.entries(data.byProvider)
      .sort((a, b) => b[1] - a[1])
      .map(([provider, amount]) => ({
        provider,
        amount: cost.formatUSD(amount),
        pct: tui.progressBar(amount / Math.max(0.01, data.totalCost), 1, { width: 20, showPercent: false }),
      }));
    console.log('\n' + tui.table(providerRows, [
      { key: 'provider', label: 'Provider', minWidth: 12 },
      { key: 'amount', label: L('Maliyet', 'Cost'), minWidth: 10, render: r => tui.C.brand(r.amount) },
      { key: 'pct', label: L('Dağılım', 'Distribution'), minWidth: 20, render: r => tui.styled(r.pct, { color: tui.PALETTE.primary }) },
    ], { borderStyle: 'round', zebra: true }));
  }

  if (Object.keys(data.byModel).length > 0) {
    console.log('\n' + tui.styled('  🤖 ' + L('Model Bazlı Maliyet (Top 5)', 'Cost by Model (Top 5)'), { color: tui.PALETTE.accent, bold: true }));
    const sortedModels = Object.entries(data.byModel).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const modelRows = sortedModels.map(([model, amount]) => ({
      model,
      amount: cost.formatUSD(amount),
    }));
    console.log('\n' + tui.table(modelRows, [
      { key: 'model', label: 'Model', minWidth: 40, render: r => tui.C.muted(r.model) },
      { key: 'amount', label: L('Maliyet', 'Cost'), minWidth: 10, render: r => tui.C.brand(r.amount) },
    ], { borderStyle: 'round', zebra: true }));
  }
  console.log('');
}

function showBudget() {
  const status = cost.checkBudget();
  const budget = cost.loadBudget();

  console.log('\n' + tui.styled('  🛡️  ' + L('Bütçe Durumu', 'Budget Status'), { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Daily
  const dailyBar = tui.progressBar(status.daily.usage, 1, {
    width: 25, showPercent: true,
    fillChar: status.daily.exceeded ? '▓' : status.daily.warning ? '▒' : '█',
  });
  const dailyColor = status.daily.exceeded ? tui.PALETTE.danger : status.daily.warning ? tui.PALETTE.warning : tui.PALETTE.success;
  console.log(`\n  ${tui.C.muted(L('Günlük limit', 'Daily limit'))}    ${tui.C.brand(cost.formatUSD(budget.dailyLimit).padStart(10))}  ${tui.styled(dailyBar, { color: dailyColor })}`);
  if (status.daily.exceeded) console.log('  ' + tui.styled('⚠️  ' + L('Günlük limit aşıldı!', 'Daily limit exceeded!'), { color: tui.PALETTE.danger, bold: true }));
  else if (status.daily.warning) console.log('  ' + tui.styled('⚠️  ' + L(`%${(budget.warnAt * 100)} eşiğine yaklaşıldı`, `approaching the ${(budget.warnAt * 100)}% threshold`), { color: tui.PALETTE.warning }));

  console.log('');

  // Monthly
  const monthlyBar = tui.progressBar(status.monthly.usage, 1, {
    width: 25, showPercent: true,
    fillChar: status.monthly.exceeded ? '▓' : status.monthly.warning ? '▒' : '█',
  });
  const monthlyColor = status.monthly.exceeded ? tui.PALETTE.danger : status.monthly.warning ? tui.PALETTE.warning : tui.PALETTE.success;
  console.log(`  ${tui.C.muted(L('Aylık limit', 'Monthly limit'))}     ${tui.C.brand(cost.formatUSD(budget.monthlyLimit).padStart(10))}  ${tui.styled(monthlyBar, { color: monthlyColor })}`);
  if (status.monthly.exceeded) console.log('  ' + tui.styled('⚠️  ' + L('Aylık limit aşıldı!', 'Monthly limit exceeded!'), { color: tui.PALETTE.danger, bold: true }));
  else if (status.monthly.warning) console.log('  ' + tui.styled('⚠️  ' + L(`%${(budget.warnAt * 100)} eşiğine yaklaşıldı`, `approaching the ${(budget.warnAt * 100)}% threshold`), { color: tui.PALETTE.warning }));

  if (status.shouldDowngrade) {
    console.log('\n' + tui.styled('  ⬇️  ' + L('Otomatik downgrade önerilir — basit soruları ucuz modele yönlendir.', 'Auto-downgrade recommended — route simple questions to a cheaper model.'), { color: tui.PALETTE.warning, bold: true }));
  }

  console.log('\n' + tui.C.muted('  ' + L('Ayarlamak için: ', 'To configure: ')) + tui.C.brand('natureco cost set <key> <value>'));
  console.log('');
}

function setBudget(args) {
  const [key, value] = args;
  if (!key || value === undefined) {
    console.log(chalk.red('\n  ' + L('Kullanım: natureco cost set <key> <value>', 'Usage: natureco cost set <key> <value>') + '\n'));
    console.log(chalk.gray('  ' + L('Anahtarlar: dailyLimit, monthlyLimit, warnAt, downgradeAt', 'Keys: dailyLimit, monthlyLimit, warnAt, downgradeAt')));
    console.log(chalk.gray('  ' + L('Örnek:     natureco cost set dailyLimit 3.00', 'Example:   natureco cost set dailyLimit 3.00')));
    console.log('');
    return;
  }
  const budget = cost.loadBudget();
  const num = parseFloat(value);
  if (isNaN(num) && key !== 'preset') {
    console.log(chalk.red(`\n  ${L('Geçersiz sayı', 'Invalid number')}: ${value}\n`));
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
    console.log(chalk.red('\n  ' + L('Kullanım: natureco cost model "<prompt>"', 'Usage: natureco cost model "<prompt>"') + '\n'));
    return;
  }
  const suggestion = cost.suggestModel(prompt);
  if (!suggestion) return;

  console.log(chalk.bold('\n  🎯 ' + L('Model Önerisi', 'Model Suggestion') + '\n'));
  console.log(chalk.gray('  ' + L('Prompt karmaşıklığı: ', 'Prompt complexity: ')) + chalk.cyan(suggestion.complexity));
  console.log(chalk.gray(`  ${cost.ROUTING[suggestion.complexity].description}\n`));
  console.log(chalk.gray('  ' + L('Önerilen model: ', 'Suggested model: ')) + chalk.bold(`${suggestion.provider}:${suggestion.model}`));
  console.log(chalk.gray('  ' + L('Neden: ', 'Reason: ')) + chalk.gray(suggestion.reason));

  const pricing = cost.getPricing(suggestion.provider, suggestion.model);
  console.log(chalk.gray('  ' + L('Fiyat: ', 'Price: ')) + chalk.cyan(`${cost.formatUSD(pricing.input)} in / ${cost.formatUSD(pricing.output)} out (per 1M)`));

  if (suggestion.optimal) {
    console.log(chalk.green('\n  ✓ ' + L('Mevcut model zaten optimal.', 'Current model is already optimal.') + '\n'));
  } else {
    console.log(chalk.yellow('\n  ⚠️  ' + L('Mevcut model optimal değil. Değiştirmek için:', 'Current model is not optimal. To change it:')));
    console.log(chalk.cyan(`     natureco config set providerUrl <url>`));
    console.log(chalk.cyan(`     natureco config set providerModel ${suggestion.model}`));
    console.log('');
  }
}

function showPrices() {
  console.log(chalk.bold('\n  💵 ' + L('Model Fiyatları (USD / 1M token)', 'Model Prices (USD / 1M tokens)') + '\n'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  // Group by provider
  const grouped = {};
  for (const [key, price] of Object.entries(cost.PRICING)) {
    const [provider] = key.split(':');
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push({ model: key.slice(provider.length + 1), ...price });
  }

  for (const [provider, models] of Object.entries(grouped)) {
    console.log(chalk.bold(`\n  ${provider.toUpperCase()}`));
    for (const m of models) {
      const inPrice = m.input === 0 ? chalk.green(L('ücretsiz', 'free')) : cost.formatUSD(m.input);
      const outPrice = m.output === 0 ? chalk.green(L('ücretsiz', 'free')) : cost.formatUSD(m.output);
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

  // Help
  console.log(chalk.yellow('\n  ' + L('Kullanım:', 'Usage:')));
  console.log(chalk.gray('    natureco cost                  ' + L('Bugünün maliyeti', "Today's cost")));
  console.log(chalk.gray('    natureco cost week             ' + L('Bu hafta', 'This week')));
  console.log(chalk.gray('    natureco cost month            ' + L('Bu ay', 'This month')));
  console.log(chalk.gray('    natureco cost all              ' + L('Tüm zamanlar', 'All time')));
  console.log(chalk.gray('    natureco cost budget           ' + L('Bütçe durumu', 'Budget status')));
  console.log(chalk.gray('    natureco cost set <k> <v>      ' + L('Bütçe ayarla', 'Set a budget')));
  console.log(chalk.gray('    natureco cost model "<p>"      ' + L('Model önerisi', 'Model suggestion')));
  console.log(chalk.gray('    natureco cost prices           ' + L('Fiyat listesi', 'Price list')));
  console.log('');
}

module.exports = cost_cmd;
