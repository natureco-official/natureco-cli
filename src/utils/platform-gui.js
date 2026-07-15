/**
 * platform-gui — Cross-platform GUI primitives for computer_use & computer_use_loop.
 *
 * Provides: captureScreenshot, executeAction, checkTool
 * Platforms: macOS (screencapture / osascript), Windows (PowerShell), Linux (xdotool / import)
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PLATFORM = os.platform();

/* ── tool availability checks ────────────────────────────────────────── */

function checkTool(name) {
  if (PLATFORM === 'win32') {
    const r = spawnSync('where', [name], { timeout: 3000, encoding: 'utf8' });
    return r.status === 0;
  }
  const r = spawnSync('which', [name], { timeout: 3000, encoding: 'utf8' });
  return r.status === 0;
}

/* ── macOS helpers ───────────────────────────────────────────────────── */

function classifyMacError(stderr) {
  try { return require('./macos-permissions').classifyMacAutomationError(stderr); } catch { return { permission: false, error: String(stderr) }; }
}

// kAXErrorFailure: a transient Accessibility API failure, commonly hit when
// the target app's UI hasn't finished registering with the accessibility
// tree yet (e.g. right after launch). Safe to retry once after a short wait.
const TRANSIENT_AX_ERROR = /\(-25200\)/;

function osaScript(script, timeoutMs = 20000, _retried = false) {
  const r = spawnSync('osascript', ['-e', script], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') return { success: false, error: 'osascript timed out after ' + timeoutMs + 'ms' };
    return { success: false, error: r.error.message };
  }
  if (r.status !== 0) {
    const msg = r.stderr || r.stdout || 'unknown error';
    if (!_retried && TRANSIENT_AX_ERROR.test(msg)) {
      spawnSync('/bin/sleep', ['0.5']);
      return osaScript(script, timeoutMs, true);
    }
    const permission = classifyMacError(msg);
    if (permission.permission) return { success: false, ...permission };
    let friendly = msg;
    if (msg.includes('access for assistive devices') || msg.includes('yardımcı erişime izin verilmiyor')) {
      friendly = 'Accessibility izni gerekli. System Settings > Privacy & Security > Accessibility > Terminal/iTerm2\'ye izin verin.';
    } else if (msg.includes('(-1700') || msg.includes('can\'t convert')) {
      friendly = 'AppleScript hatasi: ' + msg.slice(0, 200);
    }
    return { success: false, error: friendly };
  }
  return { success: true, data: r.stdout };
}

function checkMacAccessibility() {
  const r = osaScript('tell application "System Events" to get name of first process whose frontmost is true', 3000);
  return r.success;
}

/* ── Windows mouse P/Invoke helper (SendKeys has no click/scroll support) ── */

const WIN_MOUSE_TYPE =
  'Add-Type -Namespace NcWin32 -Name Mouse -MemberDefinition ' +
  "'[DllImport(\"user32.dll\")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, int extra);'; ";

const WIN_MOUSE_BUTTONS = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 },
};

function buildWindowsClickScript(x, y, { doubleClick = false, button = 'left' } = {}) {
  const flags = WIN_MOUSE_BUTTONS[button] || WIN_MOUSE_BUTTONS.left;
  const clickOnce = '[NcWin32.Mouse]::mouse_event(' + flags.down + ', 0, 0, 0, 0); [NcWin32.Mouse]::mouse_event(' + flags.up + ', 0, 0, 0, 0);';
  return 'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ' + WIN_MOUSE_TYPE +
    '[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(' + x + ', ' + y + '); ' +
    clickOnce + (doubleClick ? ' Start-Sleep -Milliseconds 60; ' + clickOnce : '');
}

function buildWindowsScrollScript(y) {
  const times = Math.abs(Math.ceil(y / 40));
  const wheelDelta = y < 0 ? 120 : -120;
  return 'Add-Type -AssemblyName System.Windows.Forms; ' + WIN_MOUSE_TYPE +
    'for ($i = 0; $i -lt ' + times + '; $i++) { [NcWin32.Mouse]::mouse_event(0x0800, 0, 0, [uint32][int32]' + wheelDelta + ', 0); Start-Sleep -Milliseconds 15 }';
}

function windowsClick(x, y, opts = {}) {
  return spawnSync('powershell', ['-Command', buildWindowsClickScript(x, y, opts)], { timeout: 5000, encoding: 'utf8' });
}

function windowsScroll(y) {
  return spawnSync('powershell', ['-Command', buildWindowsScrollScript(y)], { timeout: 5000, encoding: 'utf8' });
}

/* ── cross-platform screenshot ───────────────────────────────────────── */

function captureScreenshot(outputFile) {
  const file = outputFile || path.join(os.tmpdir(), 'nc_screenshot_' + Date.now() + '.png');

  if (PLATFORM === 'darwin') {
    const r = spawnSync('screencapture', ['-x', file], { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.error || r.status !== 0) {
      try { fs.rmSync(file, { force: true }); } catch {}
      const detail = classifyMacError(r.error ? r.error.message : (r.stderr || `screencapture exit ${r.status}`));
      const wrapped = new Error(detail.error || 'screencapture failed');
      Object.assign(wrapped, detail);
      throw wrapped;
    }
  } else if (PLATFORM === 'win32') {
    const r = spawnSync('powershell', ['-Command',
      'Add-Type -AssemblyName System.Windows.Forms; ' +
      'Add-Type -AssemblyName System.Drawing; ' +
      '$bmp = [System.Drawing.Bitmap]::new([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); ' +
      '$g = [System.Drawing.Graphics]::FromImage($bmp); ' +
      '$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size); ' +
      '$bmp.Save("' + file.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '", [System.Drawing.Imaging.ImageFormat]::Png)'
    ], { timeout: 10000, encoding: 'utf8' });
    if (r.error) {
      try { fs.rmSync(file, { force: true }); } catch {}
      throw new Error('Windows screenshot hatasi: ' + r.error.message);
    }
    if (r.status !== 0) {
      try { fs.rmSync(file, { force: true }); } catch {}
      throw new Error('Windows screenshot hatasi: ' + (r.stderr || 'exit ' + r.status));
    }
  } else {
    if (!checkTool('import')) {
      throw new Error('ImageMagick bulunamadi. Kurulum: sudo apt install imagemagick');
    }
    const r = spawnSync('import', ['-window', 'root', file], { timeout: 5000, stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.error) {
      try { fs.rmSync(file, { force: true }); } catch {}
      throw new Error('Linux screenshot hatasi: ' + r.error.message);
    }
    if (r.status !== 0) {
      try { fs.rmSync(file, { force: true }); } catch {}
      throw new Error('Linux screenshot hatasi: ' + (r.stderr || 'exit ' + r.status));
    }
  }

  if (!fs.existsSync(file)) throw new Error('Screenshot file was not created');
  const buf = fs.readFileSync(file);
  return {
    file,
    base64: buf.toString('base64'),
    hash: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

/* ── cross-platform GUI action executor ──────────────────────────────── */

const ESC = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function executeAction(action, params = {}) {
  const x = params.x, y = params.y;
  const text = params.text;
  const key = params.key;

  if (action === 'wait') return { success: true };

  /* ── click ─────────────────────────────────────────────────────── */
  if (action === 'click') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'click requires finite numeric x and y' };
    if (PLATFORM === 'darwin') {
      return osaScript('tell application "System Events" to click at {' + x + ', ' + y + '}');
    }
    if (PLATFORM === 'win32') {
      const c = params.clicks || 1;
      const r = windowsClick(x, y, { doubleClick: c > 1, button: params.button || 'left' });
      if (r.error) return { success: false, error: 'Windows click hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows click hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true };
    }
    // Linux
    if (!checkTool('xdotool')) return { success: false, error: 'xdotool bulunamadi. Kurulum: sudo apt install xdotool' };
    const r = spawnSync('xdotool', ['mousemove', String(x), String(y), 'click', '1'], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool click hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool click hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true };
  }

  /* ── type ──────────────────────────────────────────────────────── */
  if (action === 'type') {
    if (typeof text !== 'string') return { success: false, error: 'type requires text' };
    if (PLATFORM === 'darwin') {
      return osaScript('tell application "System Events" to keystroke "' + ESC(text) + '"');
    }
    if (PLATFORM === 'win32') {
      const escaped = text.replace(/[{}()^+%~]/g, '{$&}');
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.SendKeys]::SendWait("' + escaped + '")'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows type hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows type hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true };
    }
    // Linux
    if (!checkTool('xdotool')) return { success: false, error: 'xdotool bulunamadi. Kurulum: sudo apt install xdotool' };
    const r = spawnSync('xdotool', ['type', '--clearmodifiers', text], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool type hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool type hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true };
  }

  /* ── keypress ──────────────────────────────────────────────────── */
  if (action === 'keypress') {
    if (typeof key !== 'string' || !key.trim()) return { success: false, error: 'keypress requires key' };

    if (PLATFORM === 'darwin') {
      const KEY_CODES = { enter: 36, return: 36, tab: 48, escape: 53, up: 126, down: 125, left: 123, right: 124, backspace: 51, delete: 117, forwarddelete: 117, home: 115, end: 119, pageup: 116, pagedown: 121, space: 49 };
      const MOD_MAP = { cmd: 'command down', command: 'command down', option: 'option down', alt: 'option down', control: 'control down', ctrl: 'control down', shift: 'shift down' };
      const parts = key.toLowerCase().split('+').map(p => p.trim());
      const mods = [];
      let actual = '';
      for (const p of parts) { if (MOD_MAP[p]) mods.push(MOD_MAP[p]); else actual = p; }
      const using = mods.length > 0 ? ' using {' + mods.join(', ') + '}' : '';
      if (Object.prototype.hasOwnProperty.call(KEY_CODES, actual)) {
        return osaScript('tell application "System Events" to key code ' + KEY_CODES[actual] + using);
      }
      if (!actual) return { success: false, error: 'Modifier-only keypress not supported. Provide a key with modifiers (e.g. cmd+q).' };
      return osaScript('tell application "System Events" to keystroke "' + ESC(actual) + '"' + using);
    }

    if (PLATFORM === 'win32') {
      const keyMap = {
        enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', up: '{UP}', down: '{DOWN}',
        left: '{LEFT}', right: '{RIGHT}', backspace: '{BACKSPACE}', delete: '{DELETE}',
        home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
        space: ' ', ' ': ' ',
      };
      const lower = key.toLowerCase();
      const psKey = keyMap[lower] || key;
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.SendKeys]::SendWait("' + psKey.replace(/"/g, '`"') + '")'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows keypress hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows keypress hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true };
    }

    // Linux
    if (!checkTool('xdotool')) return { success: false, error: 'xdotool bulunamadi. Kurulum: sudo apt install xdotool' };
    const r = spawnSync('xdotool', ['key', key], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool keypress hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool keypress hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true };
  }

  /* ── mouse_move ────────────────────────────────────────────────── */
  if (action === 'mouse_move') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'mouse_move requires finite numeric x and y' };
    if (PLATFORM === 'darwin') {
      return osaScript('tell application "System Events" to set position of mouse to {' + x + ', ' + y + '}');
    }
    if (PLATFORM === 'win32') {
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(' + x + ', ' + y + ')'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows mouse_move hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows mouse_move hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true };
    }
    // Linux
    if (!checkTool('xdotool')) return { success: false, error: 'xdotool bulunamadi. Kurulum: sudo apt install xdotool' };
    const r = spawnSync('xdotool', ['mousemove', String(x), String(y)], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool mouse_move hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool mouse_move hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true };
  }

  /* ── scroll ────────────────────────────────────────────────────── */
  if (action === 'scroll') {
    if (typeof y !== 'number') return { success: false, error: 'scroll requires finite numeric y' };
    const times = Math.abs(Math.ceil(y / 40));

    if (PLATFORM === 'darwin') {
      return osaScript('tell application "System Events"\nrepeat ' + times + ' times\nkey code 125\nend repeat\nend tell');
    }
    if (PLATFORM === 'win32') {
      const r = windowsScroll(y);
      if (r.error) return { success: false, error: 'Windows scroll hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows scroll hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true };
    }
    // Linux
    if (!checkTool('xdotool')) return { success: false, error: 'xdotool bulunamadi. Kurulum: sudo apt install xdotool' };
    const button = y < 0 ? '4' : '5';
    const r = spawnSync('xdotool', ['click', button, '--repeat', String(times)], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool scroll hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool scroll hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true };
  }

  return { success: false, error: 'Unknown action: ' + action };
}

module.exports = {
  PLATFORM,
  checkTool,
  captureScreenshot,
  executeAction,
  osaScript,
  checkMacAccessibility,
  classifyMacError,
  windowsClick,
  windowsScroll,
  TRANSIENT_AX_ERROR,
  buildWindowsClickScript,
  buildWindowsScrollScript,
};
