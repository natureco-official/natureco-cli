/**
 * natureco help — Modern TUI help screen (v4.6+)
 *
 * Kategorize edilmiş komut listesi, TUI box + table kullanır.
 * v2.23 ASCII art yerine modern TUI engine.
 */

const chalk = require('chalk');
const tui = require('../utils/tui');
const { getConfig } = require('../utils/config');

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
      title: 'Kurulum & Giriş',
      rows: [
        { name: 'natureco setup', desc: 'İlk kurulum sihirbazı (provider, bot)' },
        { name: 'natureco login', desc: 'API key ile giriş yap' },
        { name: 'natureco logout', desc: 'Çıkış yap' },
        { name: 'natureco update', desc: 'Yeni versiyon kontrolü' },
        { name: 'natureco doctor', desc: 'Sistem sağlığı kontrolü (10 check)' },
        { name: 'natureco status', desc: 'Sistem durumu (TUI kart)' },
      ],
    },
    {
      icon: '💬',
      title: 'Chat & Agent',
      rows: [
        { name: 'natureco chat', desc: 'Sohbet başlat (→ REPL engine)' },
        { name: 'natureco chat <bot>', desc: 'Belirli bot ile sohbet' },
        { name: 'natureco chat --resume', desc: 'Son oturuma dön' },
        { name: 'natureco repl', desc: 'İnteraktif REPL (persistent memory)' },
        { name: 'natureco repl --resume <id>', desc: 'Önceki oturumu yükle' },
        { name: 'natureco ask "<soru>"', desc: 'Tek seferlik soru' },
        { name: 'natureco code <file>', desc: 'Code agent (Claude Code alternatifi)' },
        { name: 'natureco run <script.md>', desc: 'Markdown script çalıştır' },
        { name: 'natureco bots', desc: 'Bot listesi' },
        { name: 'natureco team list', desc: 'Multi-agent tipleri (8 uzman)' },
        { name: 'natureco team spawn <type> <task>', desc: 'Sub-agent çalıştır' },
      ],
    },
    {
      icon: '🛡️ ',
      title: 'Güvenlik & Gözlem',
      rows: [
        { name: 'natureco audit today', desc: "Bugünkü loglar" },
        { name: 'natureco audit stats', desc: '24 saat istatistik' },
        { name: 'natureco audit files', desc: 'Log dosyaları' },
        { name: 'natureco audit search <q>', desc: 'Log ara' },
        { name: 'natureco security audit', desc: 'Güvenlik denetimi' },
        { name: 'natureco doctor check <name>', desc: 'Tek sağlık check' },
      ],
    },
    {
      icon: '💰',
      title: 'Maliyet',
      rows: [
        { name: 'natureco cost today', desc: 'Bugünkü maliyet' },
        { name: 'natureco cost week', desc: 'Bu hafta' },
        { name: 'natureco cost month', desc: 'Bu ay' },
        { name: 'natureco cost budget', desc: 'Bütçe durumu' },
        { name: 'natureco cost prices', desc: 'Model fiyatları (21+ model)' },
        { name: 'natureco cost model "<prompt>"', desc: 'Model önerisi (router)' },
      ],
    },
    {
      icon: '🌐',
      title: 'Entegrasyonlar (10 kanal)',
      rows: [
        { name: 'natureco telegram connect', desc: 'Telegram bot bağla' },
        { name: 'natureco whatsapp connect', desc: 'WhatsApp QR ile bağla' },
        { name: 'natureco discord connect', desc: 'Discord bot bağla' },
        { name: 'natureco slack connect', desc: 'Slack workspace bağla' },
        { name: 'natureco signal connect', desc: 'Signal REST API' },
        { name: 'natureco irc connect', desc: 'IRC sunucusu' },
        { name: 'natureco mattermost connect', desc: 'Mattermost bot' },
        { name: 'natureco imessage connect', desc: 'iMessage bridge' },
        { name: 'natureco sms connect', desc: 'Twilio SMS' },
        { name: 'natureco webhooks connect', desc: 'Webhook ekle' },
      ],
    },
    {
      icon: '🌿',
      title: 'NatureCo Native',
      rows: [
        { name: 'natureco naturehub post "<text>"', desc: 'Nature Hub\'a içerik yayınla' },
        { name: 'natureco medium draft <file.md>', desc: 'Medium makale taslağı' },
        { name: 'natureco medium publish <file.md>', desc: 'Medium\'da yayınla' },
        { name: 'natureco seo audit <url>', desc: 'SEO denetimi (skor 0-100)' },
        { name: 'natureco xp', desc: 'XP/Level durumu' },
        { name: 'natureco xp rewards', desc: 'Ödül listesi' },
      ],
    },
    {
      icon: '📊',
      title: 'Skill & MCP',
      rows: [
        { name: 'natureco skills list', desc: 'Yüklü skill\'ler' },
        { name: 'natureco skills suggest', desc: 'Self-evolving öneriler' },
        { name: 'natureco skills accept <id>', desc: 'Öneriyi kabul et' },
        { name: 'natureco skills reject <id>', desc: 'Öneriyi reddet' },
        { name: 'natureco skills install <slug>', desc: 'NatureHub\'dan yükle' },
        { name: 'natureco mcp list', desc: 'MCP sunucuları' },
        { name: 'natureco mcp add <name>', desc: 'MCP sunucusu ekle' },
      ],
    },
    {
      icon: '⏰',
      title: 'Otomasyon & Dashboard',
      rows: [
        { name: 'natureco cron list', desc: 'Cron görevleri' },
        { name: 'natureco cron add', desc: 'Cron ekle' },
        { name: 'natureco hooks create <tip>', desc: 'Hook oluştur' },
        { name: 'natureco dashboard', desc: 'Web dashboard (port 7421)' },
        { name: 'natureco gateway start', desc: 'Gateway arka plan' },
      ],
    },
    {
      icon: '⚙️ ',
      title: 'Yapılandırma',
      rows: [
        { name: 'natureco config list', desc: 'Tüm ayarlar' },
        { name: 'natureco config set <key> <val>', desc: 'Ayar değiştir' },
        { name: 'natureco configure', desc: 'İnteraktif yapılandırma' },
        { name: 'natureco sessions list', desc: 'Geçmiş oturumlar' },
        { name: 'natureco sessions show <id>', desc: 'Oturum detayı' },
        { name: 'natureco memory', desc: 'Memory yönetimi' },
        { name: 'natureco init', desc: 'Proje başlat (.natureco/)' },
      ],
    },
    {
      icon: '🛠️ ',
      title: 'Diğer',
      rows: [
        { name: 'natureco agents list', desc: 'Agent listesi' },
        { name: 'natureco models list', desc: 'Model listesi' },
        { name: 'natureco channels', desc: 'Bağlı kanallar' },
        { name: 'natureco logs', desc: 'Gateway logları' },
        { name: 'natureco tasks list', desc: 'Arka plan görevleri' },
        { name: 'natureco nodes', desc: 'Network nodes' },
        { name: 'natureco security', desc: 'Güvenlik denetimi' },
        { name: 'natureco reset', desc: 'Sıfırla' },
        { name: 'natureco uninstall', desc: 'Kaldır' },
      ],
    },
    {
      icon: '💬',
      title: 'REPL İçi Komutlar (chat/repl)',
      rows: [
        { name: '/help', desc: 'Yardım' },
        { name: '/clear', desc: 'Ekranı temizle' },
        { name: '/memory', desc: 'Memory\'i göster' },
        { name: '/forget', desc: 'Memory\'i sil' },
        { name: '/sessions', desc: 'Geçmiş oturumlar' },
        { name: '/resume [id|last]', desc: 'Önceki oturuma dön' },
        { name: '/system <text>', desc: 'System prompt' },
        { name: '/model <name>', desc: 'Model değiştir' },
        { name: '/identity [ad]', desc: 'Bot adı değiştir' },
        { name: '/tokens', desc: 'Token kullanımı' },
        { name: '/doctor, /cost, /audit, /team, /xp', desc: 'REPL içinden TUI komutlar' },
        { name: '/save, /exit, /quit', desc: 'Kaydet / Çıkış' },
      ],
    },
  ];

  for (const section of sections) {
    console.log('\n' + tui.styled(`  ${section.icon}  ${section.title}`, { color: tui.PALETTE.secondary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n' + tui.table(section.rows, [
      { key: 'name', label: 'Komut', minWidth: 36, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
      { key: 'desc', label: 'Açıklama', minWidth: 35, render: r => tui.C.muted(r.desc) },
    ], { borderStyle: 'round', zebra: false }));
  }

  // Mevcut config (varsa)
  if (config.providerUrl || config.botName) {
    console.log('\n' + tui.styled('  ⚙️  Mevcut Yapılandırma', { color: tui.PALETTE.accent, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    const cardW = 54;
    const cardLines = [
      tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }),
    ];
    if (config.providerUrl) {
      const provider = config.providerUrl.replace('https?:\/\/', '').split('/')[0];
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Provider   ') + tui.styled(provider.padEnd(38), { color: tui.PALETTE.text, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    if (config.providerModel) {
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Model      ') + tui.styled((config.providerModel || '—').padEnd(38), { color: tui.PALETTE.primary, bold: true }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    if (config.botName) {
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Bot        ') + tui.styled((config.botName || '—').padEnd(38), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    if (config.userName) {
      cardLines.push(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.C.muted('Kullanıcı  ') + tui.styled((config.userName || '—').padEnd(38), { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
    }
    cardLines.push(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));
    console.log(cardLines.join('\n'));
  }

  // Linkler
  console.log('\n' + tui.styled('  🔗 Kaynaklar', { color: tui.PALETTE.secondary, bold: true }));
  console.log('   ' + tui.C.muted('Döküman  ') + tui.C.brand('https://natureco.me/cli'));
  console.log('   ' + tui.C.muted('SDK      ') + tui.C.brand('https://natureco.me/developer'));
  console.log('   ' + tui.C.muted('npm      ') + tui.C.brand('https://npmjs.com/package/natureco-cli'));
  console.log('');
}

module.exports = help;
