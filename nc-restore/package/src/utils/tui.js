/**
 * NatureCo CLI — Terminal UI Engine (Phase 9 — "DESKTOP-LIKE")
 *
 * Hedef: Kullanıcı terminal açık olduğunu unutsun.
 * PC uygulaması hissi için: animasyonlar, progress, interaktif box'lar,
 * keyboard shortcuts, tab navigation, breadcrumb, status bar, theme.
 *
 * Sıfır dependency — sadece ANSI escape kodları + readline.
 * Ink/blessed kurmuyoruz (bundle boyutu, startup hızı için).
 */

// ════════════════════════════════════════════════════════════
// ANSI Escape Sequences
// ════════════════════════════════════════════════════════════

const ESC = '\x1b';
const CSI = ESC + '[';

// Cursor
const CURSOR = {
  hide: CSI + '?25l',
  show: CSI + '?25h',
  save: ESC + '7',
  restore: ESC + '8',
  home: CSI + 'H',
  pos: (row, col) => CSI + `${row};${col}H`,
  up: (n = 1) => CSI + n + 'A',
  down: (n = 1) => CSI + n + 'B',
  right: (n = 1) => CSI + n + 'C',
  left: (n = 1) => CSI + n + 'D',
  nextLine: CSI + '1E',
  prevLine: CSI + '1F',
  clearLine: CSI + '2K',
  clearLineRight: CSI + '0K',
  clearScreen: CSI + '2J',
  clearScreenDown: CSI + '0J',
  clearScreenUp: CSI + '1J',
};

// Screen modes
const SCREEN = {
  altEnter: CSI + '?1049h',      // Alternate screen buffer
  altExit: CSI + '?1049l',
  rawEnable: () => process.stdin.setRawMode && process.stdin.setRawMode(true),
  rawDisable: () => process.stdin.setRawMode && process.stdin.setRawMode(false),
};

// Mouse (gerekirse)
const MOUSE = {
  enable: CSI + '?1000h' + CSI + '?1006h',
  disable: CSI + '?1006l' + CSI + '?1000l',
};

// ════════════════════════════════════════════════════════════
// Capability Detection
// ════════════════════════════════════════════════════════════

const CAPS = {
  color: false,
  trueColor: false,
  unicode: false,
  width: 80,
  height: 24,
  isTTY: false,
};

function detectCapabilities() {
  CAPS.isTTY = !!process.stdout.isTTY;

  // Renk desteği
  if (process.env.NO_COLOR || process.env.CI) {
    CAPS.color = false;
    CAPS.trueColor = false;
  } else if (process.env.FORCE_COLOR === '0') {
    CAPS.color = false;
  } else {
    const term = (process.env.TERM || '').toLowerCase();
    CAPS.color = CAPS.isTTY && !term.includes('dumb');
    CAPS.trueColor = CAPS.isTTY && (
      process.env.COLORTERM === 'truecolor' ||
      process.env.COLORTERM === '24bit' ||
      term.includes('256color') ||
      term.includes('truecolor')
    );
  }

  // Unicode desteği
  const lang = process.env.LANG || process.env.LC_ALL || '';
  CAPS.unicode = !/^(C|POSIX)/i.test(lang);

  // Terminal boyutu
  if (CAPS.isTTY && process.stdout.columns) {
    CAPS.width = process.stdout.columns;
    CAPS.height = process.stdout.rows;
  }

  return CAPS;
}

// ════════════════════════════════════════════════════════════
// Color Palette — NatureCo Brand
// ════════════════════════════════════════════════════════════

const PALETTE = {
  // Brand renkleri
  primary: '#22c55e',    // NatureCo yeşil
  secondary: '#0ea5e9',  // sky blue
  accent: '#f59e0b',     // amber
  success: '#10b981',
  warning: '#eab308',
  danger: '#ef4444',
  info: '#3b82f6',
  muted: '#64748b',
  text: '#e2e8f0',
  bg: '#0f172a',
  bgAlt: '#1e293b',
  border: '#334155',
};

const STYLE = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',
};

// True color helper
function fg(hex) {
  if (!CAPS.trueColor) return '';
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}
function bg(hex) {
  if (!CAPS.trueColor) return '';
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// 256-color fallback
function fg256(n) { return CAPS.color ? `\x1b[38;5;${n}m` : ''; }
function bg256(n) { return CAPS.color ? `\x1b[48;5;${n}m` : ''; }

// Styled text helper
function styled(text, opts = {}) {
  if (!CAPS.color && !CAPS.trueColor) return text;
  let code = '';
  if (opts.color) code += typeof opts.color === 'string' && opts.color.startsWith('#') ? fg(opts.color) : fg256(opts.color);
  if (opts.bg) code += typeof opts.bg === 'string' && opts.bg.startsWith('#') ? bg(opts.bg) : bg256(opts.bg);
  if (opts.bold) code += STYLE.bold;
  if (opts.dim) code += STYLE.dim;
  if (opts.italic) code += STYLE.italic;
  if (opts.underline) code += STYLE.underline;
  return `${code}${text}${STYLE.reset}`;
}

// Renkli kısayollar
const C = {
  brand: (t) => styled(t, { color: PALETTE.primary, bold: true }),
  sky: (t) => styled(t, { color: PALETTE.secondary }),
  amber: (t) => styled(t, { color: PALETTE.accent }),
  green: (t) => styled(t, { color: PALETTE.success }),
  red: (t) => styled(t, { color: PALETTE.danger }),
  yellow: (t) => styled(t, { color: PALETTE.warning }),
  blue: (t) => styled(t, { color: PALETTE.info }),
  muted: (t) => styled(t, { color: PALETTE.muted }),
  text: (t) => styled(t, { color: PALETTE.text }),
  dim: (t) => styled(t, { dim: true }),
  bold: (t) => styled(t, { bold: true }),
};

// ════════════════════════════════════════════════════════════
// Box Drawing — Unicode borders
// ════════════════════════════════════════════════════════════

const BORDER = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', tDown: '┬', tUp: '┴', tRight: '├', tLeft: '┤', cross: '┼' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', tDown: '╦', tUp: '╩', tRight: '╠', tLeft: '╣', cross: '╬' },
  round:  { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', tDown: '┬', tUp: '┴', tRight: '├', tLeft: '┤', cross: '┼' },
  heavy:  { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', tDown: '┳', tUp: '┻', tRight: '┣', tLeft: '┫', cross: '╋' },
};

function box(width, height, options = {}) {
  const {
    style = 'round',
    title = '',
    titleColor = PALETTE.primary,
    borderColor = PALETTE.border,
    bg: bgColor = null,
    padding = 1,
  } = options;

  const b = BORDER[style] || BORDER.round;
  const w = Math.max(10, width);
  const h = Math.max(3, height);

  const bc = CAPS.trueColor ? fg(borderColor) : '';
  const reset = STYLE.reset;
  const tColor = CAPS.trueColor ? fg(titleColor) : '';

  const lines = [];
  // Üst kenar
  const topTitle = title ? ` ${title} ` : '';
  const topFill = w - 2 - topTitle.length;
  const leftFill = Math.floor(topFill / 2);
  const rightFill = topFill - leftFill;
  lines.push(bc + b.tl + b.h.repeat(leftFill) + tColor + topTitle + bc + b.h.repeat(rightFill) + b.tr + reset);

  // İçeride boş satırlar (doldurulacak)
  for (let i = 1; i < h - 1; i++) {
    lines.push(bc + b.v + reset + ' '.repeat(w - 2) + bc + b.v + reset);
  }

  // Alt kenar
  lines.push(bc + b.bl + b.h.repeat(w - 2) + b.br + reset);

  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════
// Progress Bar & Spinner
// ════════════════════════════════════════════════════════════

const SPINNER_FRAMES = {
  dots:    ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line:    ['|', '/', '-', '\\'],
  arc:     ['◜', '◠', '◝', '◞', '◡', '◟'],
  pulse:   ['█', '▓', '▒', '░', '▒', '▓'],
  bounce:  ['⠁', '⠂', '⠄', '⠂'],
  grow:    ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'],
  circle:  ['◐', '◓', '◑', '◒'],
  arrow:   ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
};

function progressBar(current, total, options = {}) {
  const { width = 30, showPercent = true, showETA = false, fillChar = '█', emptyChar = '░' } = options;
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.floor(pct * width);
  const empty = width - filled;
  const bar = C.brand(fillChar.repeat(filled)) + C.muted(emptyChar.repeat(empty));
  let suffix = '';
  if (showPercent) suffix += ` ${(pct * 100).toFixed(0).padStart(3)}%`;
  if (showETA && options.startTime) {
    const elapsed = (Date.now() - options.startTime) / 1000;
    const remaining = pct > 0 ? (elapsed / pct - elapsed) : 0;
    suffix += ` ETA: ${formatDuration(remaining)}`;
  }
  return `${bar}${suffix}`;
}

function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ════════════════════════════════════════════════════════════
// Animated Spinner — async/await ile
// ════════════════════════════════════════════════════════════

class Spinner {
  constructor(text = '', options = {}) {
    this.text = text;
    this.style = options.style || 'dots';
    this.frames = SPINNER_FRAMES[this.style] || SPINNER_FRAMES.dots;
    this.interval = options.interval || 80;
    this.timer = null;
    this.index = 0;
  }
  start() {
    if (!CAPS.isTTY) {
      process.stdout.write(this.text + '... ');
      return this;
    }
    process.stdout.write(CURSOR.hide);
    this.timer = setInterval(() => {
      const frame = C.brand(this.frames[this.index]) + ' ' + C.text(this.text);
      process.stdout.write('\r' + CURSOR.clearLineRight + frame);
      this.index = (this.index + 1) % this.frames.length;
    }, this.interval);
    return this;
  }
  stop(finalText = null) {
    if (this.timer) clearInterval(this.timer);
    if (CAPS.isTTY) {
      process.stdout.write(CURSOR.show + '\r' + CURSOR.clearLineRight);
    }
    if (finalText) console.log(finalText);
    return this;
  }
  update(text) {
    this.text = text;
    return this;
  }
}

async function withSpinner(text, fn, options = {}) {
  const spinner = new Spinner(text, options).start();
  try {
    const result = await fn(spinner);
    spinner.stop(options.successText || C.green('✓ ' + text));
    return result;
  } catch (err) {
    spinner.stop(C.red('✗ ' + text) + C.red('\n  ' + err.message));
    throw err;
  }
}

// ════════════════════════════════════════════════════════════
// Banner / Splash Screen
// ════════════════════════════════════════════════════════════

function bigBanner(text, color = PALETTE.primary) {
  // Banner font: minimal ASCII
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    out.push(C.text(line, { color }));
  }
  return out.join('\n');
}

// Smooth fade-in effect (line by line)
async function fadeIn(lines, delay = 30) {
  for (const line of lines) {
    console.log(line);
    if (CAPS.isTTY) await sleep(delay);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ════════════════════════════════════════════════════════════
// Status Bar (footer / header)
// ════════════════════════════════════════════════════════════

function statusBar(items, options = {}) {
  // items: [{ label, value, color }]
  const separator = C.muted(' │ ');
  const parts = items.map(({ label, value, color }) => {
    const l = C.muted(label);
    const v = typeof color === 'string' ? styled(value, { color }) : value;
    return `${l} ${v}`;
  });
  return parts.join(separator);
}

function breadcrumb(path) {
  // path: ['home', 'naturehub', 'post']
  return path.map((seg, i) => {
    const isLast = i === path.length - 1;
    return isLast ? C.brand(seg) : C.muted(seg);
  }).join(C.muted(' › '));
}

// ════════════════════════════════════════════════════════════
// Table — gelişmiş, border + color + alignment
// ════════════════════════════════════════════════════════════

function table(data, columns, options = {}) {
  const reset = STYLE.reset;
  const { borderStyle = 'single', headerColor = PALETTE.primary, zebra = true } = options;
  const b = BORDER[borderStyle] || BORDER.single;

  // Sütun genişliklerini hesapla
  const widths = columns.map(col => {
    const headerLen = stripAnsi(col.label || col.key).length;
    const maxDataLen = Math.max(0, ...data.map(row => {
      const val = col.render ? col.render(row) : (row[col.key] || '');
      return stripAnsi(String(val)).length;
    }));
    return Math.max(headerLen, maxDataLen, col.minWidth || 3);
  });

  const lines = [];
  const bc = CAPS.trueColor ? fg(PALETTE.border) : '';

  // Üst
  const topBorder = b.tl + b.h.repeat(widths.reduce((s, w) => s + w + 3, 1) - 1) + b.tr;
  lines.push(bc + topBorder + STYLE.reset);

  // Header
  const headerCells = columns.map((col, i) => {
    const text = (col.label || col.key).padEnd(widths[i]);
    return styled(text, { color: headerColor, bold: true });
  });
  lines.push(bc + b.v + reset + ' ' + headerCells.join(' ' + bc + b.v + reset + ' ') + ' ' + bc + b.v + reset);

  // Header alt border
  const midBorder = b.tRight + widths.map(w => b.h.repeat(w + 2)).join(b.tDown) + b.tLeft;
  lines.push(bc + midBorder + STYLE.reset);

  // Veri satırları
  data.forEach((row, ri) => {
    const bgColor = zebra && ri % 2 === 1 ? bg(PALETTE.bgAlt) : '';
    const cells = columns.map((col, i) => {
      const val = col.render ? col.render(row) : (row[col.key] || '');
      const text = String(val).padEnd(widths[i]);
      return bgColor + text + STYLE.reset;
    });
    lines.push(bc + b.v + reset + ' ' + cells.join(' ' + bc + b.v + reset + ' ') + ' ' + bc + b.v + reset);
  });

  // Alt
  const botBorder = b.bl + b.h.repeat(widths.reduce((s, w) => s + w + 3, 1) - 1) + b.br;
  lines.push(bc + botBorder + STYLE.reset);

  return lines.join('\n');
}

function stripAnsi(str) {
  return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

// ════════════════════════════════════════════════════════════
// Keyboard Input
// ════════════════════════════════════════════════════════════

function readKey() {
  return new Promise((resolve) => {
    if (!CAPS.isTTY) {
      process.stdin.once('data', (chunk) => {
        const key = chunk.toString();
        resolve(parseKey(key));
      });
      return;
    }
    SCREEN.rawEnable();
    process.stdin.once('data', (chunk) => {
      SCREEN.rawDisable();
      resolve(parseKey(chunk.toString()));
    });
  });
}

function parseKey(str) {
  // Özel tuşlar
  if (str === '\x1b[A' || str === '\x1bOA') return { type: 'arrow', direction: 'up' };
  if (str === '\x1b[B' || str === '\x1bOB') return { type: 'arrow', direction: 'down' };
  if (str === '\x1b[C' || str === '\x1bOC') return { type: 'arrow', direction: 'right' };
  if (str === '\x1b[D' || str === '\x1bOD') return { type: 'arrow', direction: 'left' };
  if (str === '\x1b[H') return { type: 'home' };
  if (str === '\x1b[F') return { type: 'end' };
  if (str === '\t') return { type: 'tab' };
  if (str === '\r' || str === '\n') return { type: 'enter' };
  if (str === '\x1b' || str === '\x1b\x1b') return { type: 'escape' };
  if (str === '\x03') return { type: 'ctrl-c' };
  if (str === '\x1b[5~') return { type: 'page-up' };
  if (str === '\x1b[6~') return { type: 'page-down' };
  // Normal karakter
  if (str.length === 1) return { type: 'char', value: str };
  return { type: 'unknown', raw: str };
}

// ════════════════════════════════════════════════════════════
// Help Overlay (kısayollar)
// ════════════════════════════════════════════════════════════

function helpOverlay(shortcuts) {
  const lines = [C.bold(C.brand('  ⌨️  Klavye Kısayolları\n'))];
  for (const [key, desc] of Object.entries(shortcuts)) {
    lines.push(`  ${styled(key.padEnd(12), { bg: PALETTE.bgAlt, color: PALETTE.text })}  ${C.muted(desc)}`);
  }
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════
// Splash Screen — Animasyonlu açılış
// ════════════════════════════════════════════════════════════

async function splash(options = {}) {
  const {
    title = 'NatureCo CLI',
    version = '4.2.0',
    subtitle = 'OpenClaw\'dan daha güvenli, daha hızlı, daha ucuz',
    duration = 1500,
  } = options;

  if (!CAPS.isTTY) {
    console.log(`${title} v${version}`);
    console.log(subtitle);
    return;
  }

  // Logo satırları (ASCII art)
  const logo = [
    '███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗ ',
    '████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔═══██╗██╔═══██╗',
    '██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║   ██║██║   ██║',
    '██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║   ██║██║   ██║',
    '██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╔╝╚██████╔╝',
    '╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ',
  ];

  // Animasyon: satır satır fade-in
  process.stdout.write('\n');
  for (const line of logo) {
    process.stdout.write('  ' + styled(line, { color: PALETTE.primary, bold: true }) + '\n');
    await sleep(50);
  }

  // Alt yazı fade-in
  await sleep(200);
  process.stdout.write('\n');
  process.stdout.write('  ' + styled(title + ' v' + version, { color: PALETTE.text, bold: true }) + '\n');
  process.stdout.write('  ' + styled(subtitle, { color: PALETTE.muted, italic: true }) + '\n');
  process.stdout.write('\n');

  // Loading dots animasyonu
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const startTime = Date.now();
  let i = 0;
  while (Date.now() - startTime < duration) {
    const elapsed = Math.floor((Date.now() - startTime) / 100);
    process.stdout.write('\r  ' + styled(frames[i % frames.length], { color: PALETTE.primary, bold: true }) + ' ' +
                        styled('Hazır', { color: PALETTE.muted }) +
                        ' '.repeat(10));
    i++;
    await sleep(80);
  }

  // Final clear
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
}

// ════════════════════════════════════════════════════════════
// Welcome Card — PC uygulaması açılış hissi
// ════════════════════════════════════════════════════════════

function welcomeCard({ version, user, status, tips }) {
  const w = Math.min(70, CAPS.width - 4);
  const lines = [];

  // Üst çerçeve
  lines.push(C.brand('╭' + '─'.repeat(w - 2) + '╮'));

  // Logo (küçük)
  const logo = '🌿 NatureCo CLI';
  const ver = `v${version}`;
  const titlePadding = w - 2 - logo.length - ver.length - 2;
  lines.push(C.brand('│ ') + C.bold(logo) + ' '.repeat(titlePadding) + C.muted(ver) + C.brand(' │'));

  // Ayraç
  lines.push(C.brand('├' + '─'.repeat(w - 2) + '┤'));

  // Status satırları
  const statusLines = [
    ['Kullanıcı', user?.name || C.amber('(setup gerekli)')],
    ['Sürüm', C.text(version)],
    ['Durum', status],
    ['Çalışma dizini', C.dim(process.cwd())],
  ];
  for (const [label, value] of statusLines) {
    const line = `  ${C.muted(label.padEnd(16))} ${value}`;
    const padLen = w - 2 - stripAnsi(line).length;
    lines.push(C.brand('│') + line + ' '.repeat(Math.max(0, padLen)) + C.brand('│'));
  }

  // Ayraç
  lines.push(C.brand('├' + '─'.repeat(w - 2) + '┤'));

  // Tip
  const tipText = tips || '🌱 natureco code  →  Edit & refactor any file';
  const tipLabel = '💡 İpucu';
  const tipLine = `  ${C.amber(tipLabel)}  ${C.dim(tipText)}`;
  const tipPadLen = w - 2 - stripAnsi(tipLine).length;
  lines.push(C.brand('│') + tipLine + ' '.repeat(Math.max(0, tipPadLen)) + C.brand('│'));

  // Ayraç
  lines.push(C.brand('├' + '─'.repeat(w - 2) + '┤'));

  // Kısayollar
  const shortcuts = [
    ['Tab', 'otomatik tamamlama'],
    ['↑↓', 'komut geçmişi'],
    ['Ctrl+C', 'güvenli çıkış'],
    ['? help', 'tüm komutlar'],
  ];
  for (const [key, desc] of shortcuts) {
    const k = styled(key.padEnd(8), { bg: PALETTE.bgAlt, color: PALETTE.text });
    const line = `  ${k}  ${C.muted(desc)}`;
    const padLen = w - 2 - stripAnsi(line).length;
    lines.push(C.brand('│') + line + ' '.repeat(Math.max(0, padLen)) + C.brand('│'));
  }

  // Alt çerçeve
  lines.push(C.brand('╰' + '─'.repeat(w - 2) + '╯'));

  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════
// Pretty Errors — Stack trace yerine güzel hata mesajı
// ════════════════════════════════════════════════════════════

function prettyError(err, options = {}) {
  const { title = 'Bir hata oluştu', showStack = false, suggestion = null } = options;
  const lines = [];
  const w = Math.min(70, CAPS.width - 4);

  lines.push(C.red('╭' + '─'.repeat(w - 2) + '╮'));
  const titleIcon = '✗ ' + title;
  const titlePad = w - 2 - titleIcon.length;
  lines.push(C.red('│ ') + C.bold(C.red(titleIcon)) + ' '.repeat(Math.max(0, titlePad)) + C.red(' │'));

  lines.push(C.red('├' + '─'.repeat(w - 2) + '┤'));

  // Hata mesajı
  const msg = err.message || String(err);
  const wrapped = wrapText(msg, w - 6);
  for (const line of wrapped) {
    const padded = '  ' + line;
    const padLen = w - 2 - padded.length;
    lines.push(C.red('│') + padded + ' '.repeat(Math.max(0, padLen)) + C.red(' │'));
  }

  if (suggestion) {
    lines.push(C.red('├' + '─'.repeat(w - 2) + '┤'));
    const sugText = '💡 ' + suggestion;
    const sugWrap = wrapText(sugText, w - 6);
    for (const line of sugWrap) {
      const padded = '  ' + styled(line, { color: PALETTE.warning });
      const padLen = w - 2 - padded.length;
      lines.push(C.red('│') + padded + ' '.repeat(Math.max(0, padLen)) + C.red(' │'));
    }
  }

  if (showStack && err.stack) {
    lines.push(C.red('├' + '─'.repeat(w - 2) + '┤'));
    const stackLines = err.stack.split('\n').slice(0, 5);
    for (const s of stackLines) {
      const padded = '  ' + styled(s, { color: PALETTE.muted, dim: true });
      const padLen = w - 2 - Math.min(stripAnsi(padded).length, w - 4);
      lines.push(C.red('│') + padded.slice(0, w - 2) + ' '.repeat(Math.max(0, padLen)) + C.red(' │'));
    }
  }

  lines.push(C.red('╰' + '─'.repeat(w - 2) + '╯'));
  return lines.join('\n');
}

function wrapText(text, width) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ════════════════════════════════════════════════════════════
// Notification — toast gibi sağ üstten (basit)
// ════════════════════════════════════════════════════════════

function notify(message, options = {}) {
  const { type = 'info', duration = 3000 } = options;
  const icons = { info: 'ℹ️', success: '✓', warning: '⚠️', error: '✗' };
  const colors = { info: PALETTE.info, success: PALETTE.success, warning: PALETTE.warning, error: PALETTE.danger };
  const icon = icons[type] || icons.info;
  const color = colors[type] || colors.info;
  const text = `  ${icon} ${message}  `;
  console.log('\n' + styled(text, { bg: color, color: '#000000', bold: true }));
}

// ════════════════════════════════════════════════════════════
// Tree view — file/dir ağacı
// ════════════════════════════════════════════════════════════

function tree(items, options = {}) {
  const { indent = '  ', expanded = {} } = options;
  const lines = [];

  function render(items, depth = 0) {
    for (const item of items) {
      const isLast = item === items[items.length - 1];
      const prefix = depth === 0 ? '' : (indent.repeat(depth - 1) + (isLast ? '└─ ' : '├─ '));
      const icon = item.icon || (item.children ? '📁' : '📄');
      const name = item.name || item.label || '';
      const color = item.children ? PALETTE.primary : PALETTE.text;
      lines.push(prefix + icon + ' ' + styled(name, { color }));
      if (item.children && (depth === 0 || expanded[item.name])) {
        render(item.children, depth + 1);
      }
    }
  }

  render(items);
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════
// Init
// ════════════════════════════════════════════════════════════

function init() {
  detectCapabilities();
  // Resize olunca güncelle
  if (CAPS.isTTY) {
    process.stdout.on('resize', () => {
      CAPS.width = process.stdout.columns || 80;
      CAPS.height = process.stdout.rows || 24;
    });
  }
}

module.exports = {
  // Capabilities
  CAPS, PALETTE, STYLE,
  // ANSI primitives
  CURSOR, SCREEN, MOUSE,
  // Color helpers
  fg, bg, fg256, bg256, styled, hexToRgb, C, stripAnsi,
  // Borders & boxes
  BORDER, box,
  // Progress
  SPINNER_FRAMES, Spinner, withSpinner, progressBar, formatDuration,
  // Visual
  bigBanner, fadeIn, splash, welcomeCard, table, statusBar, breadcrumb,
  // Errors
  prettyError,
  // Notifications
  notify,
  // Tree
  tree,
  // Input
  readKey, parseKey, helpOverlay,
  // Init
  init, detectCapabilities,
  sleep,
};
