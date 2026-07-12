/**
 * natureco help — Modern TUI help screen (v4.6+)
 *
 * Categorized command list; uses the TUI box + table engine.
 * Bilingual (tr|en) via the i18n `L(tr, en)` helper.
 */

const chalk = require('chalk');
const tui = require('../utils/tui');
const { getConfig } = require('../utils/config');
const { getLang } = require('../utils/i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

function providerHostname(providerUrl) {
  if (!providerUrl) return '';
  try {
    return new URL(providerUrl).hostname;
  } catch {
    return String(providerUrl).replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function help() {
  const config = getConfig() || {};
  const version = require('../../package.json').version;
  const width = 64;

  console.log('');

  // Header — TUI box
  const headerLines = [
    tui.styled('  ╭' + '─'.repeat(width) + '╮', { color: tui.PALETTE.primary }),
    tui.styled('  │', { color: tui.PALETTE.primary }) + '  🌿 ' + tui.styled('NatureCo CLI', { color: tui.PALETTE.primary, bold: true }) + tui.C.muted('   v' + version) + '   ' + tui.C.muted('Terminal-native AI agent') + tui.styled(' │', { color: tui.PALETTE.primary }),
    tui.styled('  ╰' + '─'.repeat(width) + '╯', { color: tui.PALETTE.primary }),
  ];
  console.log(headerLines.join('\n'));

  const sections = [
    {
      icon: '⚙️ ',
      title: L('Kurulum & Giriş', 'Setup & Sign-in'),
      rows: [
        { name: 'natureco setup', desc: L('İlk kurulum sihirbazı (provider, bot)', 'First-run wizard (provider, bot)') },
        { name: 'natureco login', desc: L('API key ile giriş yap', 'Sign in with an API key') },
        { name: 'natureco account', desc: L('NatureCo hesabı / SSO (login|logout|whoami)', 'NatureCo account / SSO (login|logout|whoami)') },
        { name: 'natureco lang', desc: L('Arayüz dili (tr | en)', 'Interface language (tr | en)') },
        { name: 'natureco logout', desc: L('Çıkış yap', 'Sign out') },
        { name: 'natureco update', desc: L('Yeni versiyon kontrolü', 'Check for a new version') },
        { name: 'natureco doctor', desc: L('Sistem sağlığı kontrolü (10 check)', 'System health check (10 checks)') },
        { name: 'natureco status', desc: L('Sistem durumu (TUI kart)', 'System status (TUI card)') },
      ],
    },
    {
      icon: '💬',
      title: 'Chat & Agent',
      rows: [
        { name: 'natureco chat', desc: L('Sohbet başlat (→ REPL engine)', 'Start a chat (→ REPL engine)') },
        { name: 'natureco chat <bot>', desc: L('Belirli bot ile sohbet', 'Chat with a specific bot') },
        { name: 'natureco chat --resume', desc: L('Son oturuma dön', 'Resume the last session') },
        { name: 'natureco repl', desc: L('İnteraktif REPL (persistent memory)', 'Interactive REPL (persistent memory)') },
        { name: 'natureco repl --resume <id>', desc: L('Önceki oturumu yükle', 'Load a previous session') },
        { name: 'natureco ask "<soru>"', desc: L('Tek seferlik soru', 'One-off question') },
        { name: 'natureco code <file>', desc: L('Code agent (Claude Code alternatifi)', 'Code agent (Claude Code alternative)') },
        { name: 'natureco run <script.md>', desc: L('Markdown script çalıştır', 'Run a Markdown script') },
        { name: 'natureco bots', desc: L('Bot listesi', 'List bots') },
        { name: 'natureco team list', desc: L('Multi-agent tipleri (8 uzman)', 'Multi-agent types (8 specialists)') },
        { name: 'natureco team spawn <type> <task>', desc: L('Sub-agent çalıştır', 'Run a sub-agent') },
      ],
    },
    {
      icon: '🛡️ ',
      title: L('Güvenlik & Gözlem', 'Security & Observability'),
      rows: [
        { name: 'natureco audit today', desc: L('Bugünkü loglar', "Today's logs") },
        { name: 'natureco audit stats', desc: L('24 saat istatistik', '24-hour statistics') },
        { name: 'natureco audit files', desc: L('Log dosyaları', 'Log files') },
        { name: 'natureco audit search <q>', desc: L('Log ara', 'Search logs') },
        { name: 'natureco security audit', desc: L('Güvenlik denetimi', 'Security audit') },
        { name: 'natureco doctor check <name>', desc: L('Tek sağlık check', 'Single health check') },
      ],
    },
    {
      icon: '💰',
      title: L('Maliyet', 'Cost'),
      rows: [
        { name: 'natureco cost today', desc: L('Bugünkü maliyet', "Today's cost") },
        { name: 'natureco cost week', desc: L('Bu hafta', 'This week') },
        { name: 'natureco cost month', desc: L('Bu ay', 'This month') },
        { name: 'natureco cost budget', desc: L('Bütçe durumu', 'Budget status') },
        { name: 'natureco cost prices', desc: L('Model fiyatları (21+ model)', 'Model prices (21+ models)') },
        { name: 'natureco cost model "<prompt>"', desc: L('Model önerisi (router)', 'Model recommendation (router)') },
      ],
    },
    {
      icon: '🌐',
      title: L('Entegrasyonlar (10 kanal)', 'Integrations (10 channels)'),
      rows: [
        { name: 'natureco telegram connect', desc: L('Telegram bot bağla', 'Connect a Telegram bot') },
        { name: 'natureco whatsapp connect', desc: L('WhatsApp QR ile bağla', 'Connect WhatsApp via QR') },
        { name: 'natureco discord connect', desc: L('Discord bot bağla', 'Connect a Discord bot') },
        { name: 'natureco slack connect', desc: L('Slack workspace bağla', 'Connect a Slack workspace') },
        { name: 'natureco signal connect', desc: L('Signal REST API', 'Signal REST API') },
        { name: 'natureco irc connect', desc: L('IRC sunucusu', 'IRC server') },
        { name: 'natureco mattermost connect', desc: L('Mattermost bot', 'Mattermost bot') },
        { name: 'natureco imessage connect', desc: L('iMessage bridge', 'iMessage bridge') },
        { name: 'natureco sms connect', desc: L('Twilio SMS', 'Twilio SMS') },
        { name: 'natureco webhooks connect', desc: L('Webhook ekle', 'Add a webhook') },
      ],
    },
    {
      icon: '🌿',
      title: 'NatureCo Native',
      rows: [
        { name: 'natureco naturehub post "<text>"', desc: L('NatureCo API ile bota mesaj gönder', 'Send a message to a bot via the NatureCo API') },
        { name: 'natureco naturehub list', desc: L('Botlarını listele', 'List your bots') },
        { name: 'natureco naturehub info [bot_id]', desc: L('Bot detayı', 'Bot details') },
        { name: 'natureco medium draft <file.md>', desc: L('Medium makale taslağı', 'Medium article draft') },
        { name: 'natureco medium publish <file.md>', desc: L("Medium'da yayınla", 'Publish to Medium') },
        { name: 'natureco seo audit <url>', desc: L('SEO denetimi (skor 0-100)', 'SEO audit (score 0-100)') },
        { name: 'natureco xp', desc: L('XP/Level durumu', 'XP / level status') },
        { name: 'natureco xp rewards', desc: L('Ödül listesi', 'Rewards list') },
      ],
    },
    {
      icon: '📊',
      title: 'Skill & MCP',
      rows: [
        { name: 'natureco skills list', desc: L("Yüklü skill'ler", 'Installed skills') },
        { name: 'natureco skills suggest', desc: L('Self-evolving öneriler', 'Self-evolving suggestions') },
        { name: 'natureco skills accept <id>', desc: L('Öneriyi kabul et', 'Accept a suggestion') },
        { name: 'natureco skills reject <id>', desc: L('Öneriyi reddet', 'Reject a suggestion') },
        { name: 'natureco skills install <slug>', desc: L("NatureHub'dan yükle", 'Install from NatureHub') },
        { name: 'natureco mcp list', desc: L('MCP sunucuları', 'MCP servers') },
        { name: 'natureco mcp add <name>', desc: L('MCP sunucusu ekle', 'Add an MCP server') },
      ],
    },
    {
      icon: '⏰',
      title: L('Otomasyon & Dashboard', 'Automation & Dashboard'),
      rows: [
        { name: 'natureco cron list', desc: L('Cron görevleri', 'Cron jobs') },
        { name: 'natureco cron add', desc: L('Cron ekle', 'Add a cron job') },
        { name: 'natureco hooks create <tip>', desc: L('Hook oluştur', 'Create a hook') },
        { name: 'natureco dashboard', desc: L('Web dashboard (port 7421)', 'Web dashboard (port 7421)') },
        { name: 'natureco gateway start', desc: L('Gateway arka plan', 'Gateway (background)') },
      ],
    },
    {
      icon: '⚙️ ',
      title: L('Yapılandırma', 'Configuration'),
      rows: [
        { name: 'natureco config list', desc: L('Tüm ayarlar', 'All settings') },
        { name: 'natureco config set <key> <val>', desc: L('Ayar değiştir', 'Change a setting') },
        { name: 'natureco configure', desc: L('İnteraktif yapılandırma', 'Interactive configuration') },
        { name: 'natureco sessions list', desc: L('Geçmiş oturumlar', 'Past sessions') },
        { name: 'natureco sessions show <id>', desc: L('Oturum detayı', 'Session details') },
        { name: 'natureco memory', desc: L('Memory yönetimi', 'Memory management') },
        { name: 'natureco init', desc: L('Proje başlat (.natureco/)', 'Initialize a project (.natureco/)') },
      ],
    },
    {
      icon: '🛠️ ',
      title: L('Diğer', 'Other'),
      rows: [
        { name: 'natureco agents list', desc: L('Agent listesi', 'List agents') },
        { name: 'natureco models list', desc: L('Model listesi', 'List models') },
        { name: 'natureco channels', desc: L('Bağlı kanallar', 'Connected channels') },
        { name: 'natureco logs', desc: L('Gateway logları', 'Gateway logs') },
        { name: 'natureco tasks list', desc: L('Arka plan görevleri', 'Background tasks') },
        { name: 'natureco nodes', desc: L('Network nodes', 'Network nodes') },
        { name: 'natureco security', desc: L('Güvenlik denetimi', 'Security audit') },
        { name: 'natureco reset', desc: L('Sıfırla', 'Reset') },
        { name: 'natureco uninstall', desc: L('Kaldır', 'Uninstall') },
      ],
    },
    {
      icon: '💬',
      title: L('REPL İçi Komutlar (chat/repl)', 'In-REPL commands (chat/repl)'),
      rows: [
        { name: '/help', desc: L('Yardım', 'Help') },
        { name: '/clear', desc: L('Ekranı temizle', 'Clear the screen') },
        { name: '/memory', desc: L("Memory'i göster", 'Show memory') },
        { name: '/forget', desc: L("Memory'i sil", 'Clear memory') },
        { name: '/sessions', desc: L('Geçmiş oturumlar', 'Past sessions') },
        { name: '/resume [id|last]', desc: L('Önceki oturuma dön', 'Resume a previous session') },
        { name: '/system <text>', desc: L('System prompt', 'System prompt') },
        { name: '/model <name>', desc: L('Model değiştir', 'Switch model') },
        { name: '/identity [ad]', desc: L('Bot adı değiştir', 'Rename the bot') },
        { name: '/tokens', desc: L('Token kullanımı', 'Token usage') },
        { name: '/doctor, /cost, /audit, /team, /xp', desc: L('REPL içinden TUI komutlar', 'TUI commands from inside the REPL') },
        { name: '/save, /exit, /quit', desc: L('Kaydet / Çıkış', 'Save / Exit') },
      ],
    },
  ];

  for (const section of sections) {
    console.log('\n' + tui.styled(`  ${section.icon}  ${section.title}`, { color: tui.PALETTE.secondary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n' + tui.table(section.rows, [
      { key: 'name', label: L('Komut', 'Command'), minWidth: 36, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
      { key: 'desc', label: L('Açıklama', 'Description'), minWidth: 35, render: r => tui.C.muted(r.desc) },
    ], { borderStyle: 'round', zebra: false }));
  }

  // Current config (if any)
  if (config.providerUrl || config.botName) {
    console.log('\n' + tui.styled('  ⚙️  ' + L('Mevcut Yapılandırma', 'Current Configuration'), { color: tui.PALETTE.accent, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    const cardW = 54;
    const cardLines = [
      tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }),
    ];
    if (config.providerUrl) {
      const provider = providerHostname(config.providerUrl);
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Provider   ') + tui.styled(provider.padEnd(38), { color: tui.PALETTE.text, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    if (config.providerModel) {
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Model      ') + tui.styled((config.providerModel || '—').padEnd(38), { color: tui.PALETTE.primary, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    if (config.botName) {
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Bot        ') + tui.styled((config.botName || '—').padEnd(38), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    if (config.userName) {
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted(L('Kullanıcı  ', 'User       ')) + tui.styled((config.userName || '—').padEnd(38), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    cardLines.push(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));
    console.log(cardLines.join('\n'));
  }

  // Links
  console.log('\n' + tui.styled('  🔗 ' + L('Kaynaklar', 'Resources'), { color: tui.PALETTE.secondary, bold: true }));
  console.log('   ' + tui.C.muted(L('Döküman  ', 'Docs     ')) + tui.C.brand('https://natureco.me/cli'));
  console.log('   ' + tui.C.muted('SDK      ') + tui.C.brand('https://natureco.me/developer'));
  console.log('   ' + tui.C.muted('npm      ') + tui.C.brand('https://npmjs.com/package/natureco-cli'));
  console.log('');
}

module.exports = help;
module.exports.providerHostname = providerHostname;
