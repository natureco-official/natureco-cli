const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
const { getApiKey, getConfig } = require('../utils/config');
const { getBots } = require('../utils/api');

async function bots() {
  const config = getConfig();
  const apiKey = getApiKey() || config.providerApiKey || '';

  console.log('\n' + tui.styled(L('  ⏳ Botlar yükleniyor...', '  ⏳ Loading bots...'), { color: tui.PALETTE.muted }));

  try {
    // v4.6+: Eğer local provider varsa (api.minimax.io, api.groq.com),
    // NatureCo backend yerine direkt provider config'den bot listele
    let botList;
    if (config.providerUrl && !config.providerUrl.includes('natureco.me') && config.bots) {
      // Local provider — config'deki bot'ları kullan
      const botsObj = config.bots || {};
      const localBots = Object.values(botsObj).map(b => ({
        id: b.id,
        name: b.name,
        ai_provider: b.provider || 'local',
        model: b.model,
      }));
      if (config.botName) {
        const defaultBot = {
          id: 'default', name: config.botName,
          ai_provider: config.providerUrl.includes('minimax') ? 'minimax' : 'openai-compatible',
          model: config.providerModel,
        };
        if (!localBots.find(b => b.id === 'default')) localBots.unshift(defaultBot);
      }
      botList = { bots: localBots };
    } else {
      // Eski: NatureCo backend
      botList = await getBots(apiKey);
    }

    if (!botList || !botList.bots || botList.bots.length === 0) {
      console.log('\n' + tui.C.muted(L('  Bot bulunamadı.', '  No bots found.')));
      console.log('  ' + tui.C.muted(L('Oluşturmak için: ', 'To create: ')) + tui.C.brand('natureco setup') + ' ' + tui.C.muted(L('veya config\'e bot ekleyin.', 'or add a bot to config.')));
      console.log('');
      return;
    }

    const rows = botList.bots.map((bot, i) => ({
      idx: String(i + 1),
      name: bot.name || L('(isimsiz)', '(unnamed)'),
      id: bot.id,
      provider: bot.ai_provider || bot.provider || '—',
      model: bot.model || '—',
      active: config.botName === bot.name,
    }));

    console.log('\n' + tui.styled(L('  🤖 Bot Listesi (', '  🤖 Bot List (') + rows.length + ')', { color: tui.PALETTE.primary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n' + tui.table(rows, [
      { key: 'idx', label: '#', minWidth: 4 },
      {
        key: 'name', label: L('İsim', 'Name'), minWidth: 18,
        render: r => r.active
          ? tui.styled(r.name + '  ●', { color: tui.PALETTE.success, bold: true })
          : tui.C.text(r.name)
      },
      { key: 'id', label: 'ID', minWidth: 18, render: r => tui.C.muted(r.id) },
      { key: 'provider', label: 'Provider', minWidth: 10, render: r => tui.C.text(r.provider) },
      { key: 'model', label: 'Model', minWidth: 20, render: r => tui.C.muted(r.model) },
    ], { borderStyle: 'round', zebra: true }));

    console.log('\n  ' + tui.C.muted(L('Chat başlatmak için: ', 'To start chat: ')) + tui.C.brand('natureco chat') + ' ' + tui.C.muted(L('veya ', 'or ')) + tui.C.brand('natureco repl'));
    console.log('');
  } catch (err) {
    console.log('\n' + tui.C.red(L('  ❌ Hata: ', '  ❌ Error: ') + err.message) + '\n');
    process.exit(1);
  }
}

module.exports = bots;
