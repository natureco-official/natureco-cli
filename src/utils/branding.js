/**
 * NatureCo CLI — Branding & Splash
 *
 * Tek kaynaktan tüm logo, banner ve renkleri yönetir.
 * Brand kimliğini koruyalım — her yerde aynı görünüm.
 */

const chalk = require('chalk');
const os = require('os');

const COLORS = {
  primary: chalk.hex('#22c55e'),   // NatureCo yeşili
  secondary: chalk.hex('#0ea5e9'), // gökyüzü mavisi
  accent: chalk.hex('#f59e0b'),    // amber
  muted: chalk.gray,
  danger: chalk.red,
  success: chalk.green,
  bold: chalk.bold,
};

const SMALL_LOGO = [
  '  🌿  NatureCo',
];

const FULL_LOGO = [
  '███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗ ',
  '████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔════╝ ██╔═══██╗',
  '██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║      ██║   ██║',
  '██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║      ██║   ██║',
  '██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╗ ╚██████╔╝',
  '╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ',
];

const MASCOT = `         (\\_/)
         (•_•)    Hoş geldin!
         />🌿`;

const MASCOT_COMPACT = '(\\_/) · (•_•) · />🌿';

const TIPS = [
  '🌱 natureco code  →  Edit & refactor any file in one command',
  '💬 natureco chat "İchigo"  →  Talk to your default bot',
  '📦 natureco skills install seo-audit  →  Add new capabilities',
  '🔁 natureco cron add "0 9 * * *" "seo-check"  →  Schedule recurring jobs',
  '🛡️  natureco doctor  →  Diagnose setup issues in seconds',
  '🌍 natureco naturehub post "Hello world"  →  Publish to Nature Hub',
  '🔍 natureco seo audit https://natureco.me  →  SEO insights, instantly',
  '💰 natureco cost today  →  See today\'s AI spend',
];

function pickDailyTip() {
  const day = Math.floor(Date.now() / 86400000);
  return TIPS[day % TIPS.length];
}

/**
 * Kompakt banner — her komut çıktısının üstünde kullanılabilir.
 */
function banner(opts = {}) {
  const { version, subtitle, userName, botName } = opts;
  const lines = [];
  lines.push('');
  lines.push(COLORS.primary.bold(SMALL_LOGO[0]));
  if (version) {
    const v = COLORS.muted(`v${version}`);
    const subtitleLine = subtitle ? COLORS.secondary(` · ${subtitle}`) : '';
    lines.push(`  ${v}${subtitleLine}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Tam logo — sadece ilk açılışta ve --version gibi özel yerlerde.
 */
function fullLogo(opts = {}) {
  const { version, tagline } = opts;
  const lines = [];
  for (const ln of FULL_LOGO) lines.push(COLORS.primary(ln));
  lines.push('');
  if (tagline) lines.push('  ' + COLORS.secondary(tagline));
  if (version) lines.push('  ' + COLORS.muted(`v${version} · Node ${process.version.slice(1)} · ${os.platform()}`));
  lines.push('');
  return lines.join('\n');
}

/**
 * Gateway ekranı — komut yoksa gösterilen ana ekran.
 */
function gatewayScreen({ version, userName, botName, loginStatus }) {
  const lines = [];
  lines.push(COLORS.primary.bold('  🌿 NatureCo CLI'));
  lines.push(COLORS.muted(`  v${version}  ·  OpenClaw\'dan daha güvenli, daha hızlı, daha ucuz`));
  lines.push('');
  lines.push('  ' + COLORS.muted('─'.repeat(64)));
  lines.push(`  ${COLORS.muted('👤')}  Kullanıcı: ${userName ? COLORS.bold(userName) : COLORS.accent('(setup gerekli)')}`);
  lines.push(`  ${COLORS.muted('🤖')}  Bot:      ${botName ? COLORS.bold(botName) : COLORS.accent('(setup gerekli)')}`);
  lines.push(`  ${COLORS.muted('🔐')}  Giriş:    ${loginStatus === 'ok' ? COLORS.success('✓ aktif') : COLORS.danger('✗ gerekli')}`);
  lines.push('  ' + COLORS.muted('─'.repeat(64)));
  lines.push('');
  lines.push('  ' + COLORS.muted(pickDailyTip()));
  lines.push('');
  lines.push(`  ${COLORS.secondary.bold('Hızlı başlangıç:')}`);
  lines.push(`    ${COLORS.cyan('natureco chat')}              Bot ile sohbet`);
  lines.push(`    ${COLORS.cyan('natureco code <file>')}        Code agent — dosya oku, düzenle`);
  lines.push(`    ${COLORS.cyan('natureco ask "<soru>"')}      Tek soru sor`);
  lines.push(`    ${COLORS.cyan('natureco doctor')}            Sistem teşhisi`);
  lines.push(`    ${COLORS.cyan('natureco help')}              Tüm komutlar`);
  lines.push('');
  return lines.join('\n');
}

/**
 * İlk kurulum ekranı — setup çalıştırılırken gösterilir.
 */
function firstRunScreen() {
  const lines = [];
  lines.push(COLORS.primary.bold(SMALL_LOGO[0]));
  lines.push('');
  lines.push(COLORS.secondary.bold('  İlk kurulum hoş geldin!'));
  lines.push(COLORS.muted('  60 saniyede hazır olalım.\n'));
  return lines.join('\n');
}

module.exports = {
  COLORS,
  SMALL_LOGO,
  FULL_LOGO,
  MASCOT,
  MASCOT_COMPACT,
  pickDailyTip,
  banner,
  fullLogo,
  gatewayScreen,
  firstRunScreen,
};
