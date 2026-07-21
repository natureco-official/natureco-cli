/**
 * natureco tools — Tool registry management (Hermes-style)
 *
 * Kullanım:
 *   natureco tools            List toolset groups
 *   natureco tools list       Detailed tool list
 *   natureco tools enable <name>    Enable a tool
 *   natureco tools disable <name>   Disable a tool
 */

const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
const { loadToolDefinitions, EMOJI_MAP, TOOLSET_MAP } = require('../utils/tools');
const { getConfig, setConfigValue } = require('../utils/config');

function main(args) {
  args = args || [];
  const action = args[0] || 'list';

  switch (action) {
    case 'list':
      return cmdList();
    case 'enable':
      return cmdEnable(args[1]);
    case 'disable':
      return cmdDisable(args[1]);
    default:
      console.log(chalk.yellow(L('Kullanım:', 'Usage:')));
      console.log(chalk.gray('  natureco tools                Grup listesi'));
      console.log(chalk.gray(L('  natureco tools list           Detaylı liste', '  natureco tools list           Detailed list')));
      console.log(chalk.gray(L('  natureco tools enable <name>  Tool etkinleştir', '  natureco tools enable <name>  Enable tool')));
      console.log(chalk.gray(L('  natureco tools disable <name> Tool devre dışı', '  natureco tools disable <name> Disable tool')));
      console.log('');
  }
}

function cmdList() {
  const allTools = loadToolDefinitions();
  const disabled = getDisabledTools();

  const byToolset = {};
  for (const t of allTools) {
    const ts = t.toolset || 'general';
    if (!byToolset[ts]) byToolset[ts] = [];
    byToolset[ts].push(t);
  }

  let total = 0;
  for (const [ts, tools] of Object.entries(byToolset).sort()) {
    const active = tools.filter(t => !disabled.has(t.name));
    total += active.length;
    const line = tools.map(t => {
      const d = disabled.has(t.name);
      return (d ? chalk.gray.dim : chalk.white)((t.emoji || '  ') + ' ' + t.name);
    }).join('  ');
    console.log(chalk.cyan.bold('\n  ' + ts + ' (' + active.length + '/' + tools.length + ')'));
    console.log('    ' + line);
  }

  console.log(chalk.gray(L('\n  Toplam: ', '\n  Total: ') + total + ' aktif tool'));
  if (disabled.size > 0) {
    console.log(chalk.yellow(L('  Devre dışı: ', '  Disabled: ') + [...disabled].join(', ')));
  }
  console.log('');
}

function getDisabledTools() {
  const cfg = getConfig();
  return new Set(cfg.disabledTools || []);
}

function cmdEnable(name) {
  if (!name) return console.log(chalk.red(L('Tool adı gerekli: natureco tools enable <name>', 'Tool name required: natureco tools enable <name>')));
  const disabled = getDisabledTools();
  if (!disabled.has(name)) return console.log(chalk.yellow(name + ' zaten etkin.'));
  disabled.delete(name);
  setConfigValue('disabledTools', [...disabled]);
  console.log(chalk.green('✅ ' + name + ' etkinleştirildi.'));
}

function cmdDisable(name) {
  if (!name) return console.log(chalk.red(L('Tool adı gerekli: natureco tools disable <name>', 'Tool name required: natureco tools disable <name>')));
  const allTools = loadToolDefinitions();
  const tool = allTools.find(t => t.name === name);
  if (!tool) return console.log(chalk.red(L('Tool bulunamadı: ', 'Tool not found: ') + name));
  const disabled = getDisabledTools();
  if (disabled.has(name)) return console.log(chalk.yellow(name + ' zaten devre dışı.'));
  disabled.add(name);
  setConfigValue('disabledTools', [...disabled]);
  console.log(chalk.yellow('⛔ ' + name + ' devre dışı bırakıldı.'));
}

// Diğer modüllerden çağrılabilir
main.getDisabledTools = getDisabledTools;

module.exports = main;
