const { spawnSync } = require('child_process');
const os = require('os');
const { classifyMacAutomationError } = require('../utils/macos-permissions');
const { windowsClick, windowsScroll } = require('../utils/platform-gui');
const fs = require('fs');
const path = require('path');

const PLATFORM = os.platform();

function checkTool(name) {
  if (PLATFORM === 'win32') {
    const r = spawnSync('where', [name], { timeout: 3000, encoding: 'utf8' });
    return r.status === 0;
  }
  const r = spawnSync('which', [name], { timeout: 3000, encoding: 'utf8' });
  return r.status === 0;
}

function requireXdotool() {
  if (!checkTool('xdotool')) {
    return { success: false, error: 'xdotool bulunamadi. Kurulum: sudo apt install xdotool' };
  }
  return null;
}

function requirePowershell() {
  if (PLATFORM === 'win32' && !checkTool('powershell')) {
    return { success: false, error: 'PowerShell bulunamadi' };
  }
  return null;
}

const KEY_MAP_DARWIN = {
  enter: 'return',
  return: 'return',
  tab: 'tab',
  escape: 'escape',
  esc: 'escape',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  backspace: 'delete',
  delete: 'forwarddelete',
  forwarddelete: 'forwarddelete',
  home: 'home',
  end: 'end',
  pageup: 'page up',
  pagedown: 'page down',
  space: 'space',
  ' ': 'space',
};

const MODIFIER_MAP = {
  command: 'command down',
  cmd: 'command down',
  option: 'option down',
  alt: 'option down',
  control: 'control down',
  ctrl: 'control down',
  shift: 'shift down',
};

function escapeText(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function osaScript(script, timeoutMs = 20000) {
  const result = spawnSync('osascript', ['-e', script], {
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      return { success: false, error: 'osascript timed out after ' + timeoutMs + 'ms' };
    }
    return { success: false, error: result.error.message };
  }
  if (result.status !== 0) {
    const msg = result.stderr || result.stdout || 'unknown error';
    const permission = classifyMacAutomationError(msg);
    if (permission.permission) return { success: false, ...permission };
    let friendly = msg;
    if (msg.includes('yardımcı erişime izin verilmiyor') || msg.includes('access for assistive devices')) {
      friendly = 'Accessibility izni gerekli. System Settings > Privacy & Security > Accessibility > Terminal/iTerm2\'ye izin verin.';
    } else if (msg.includes('(-1700') || msg.includes('can\'t convert')) {
      friendly = 'AppleScript hatasi: ' + msg.slice(0, 200);
    }
    return { success: false, error: friendly };
  }
  return { success: true, data: result.stdout };
}

function checkAccessibility() {
  const r = osaScript('tell application "System Events" to get name of first process whose frontmost is true', 3000);
  return r.success;
}

function accessibilityDenied() {
  return { success: false, ...classifyMacAutomationError('Accessibility permission denied') };
}

async function computerUse(params) {
  const { action, x, y, key, text, button, clicks, file } = params;

  if (action === 'screenshot') {
    const outputFile = file || path.join(os.tmpdir(), 'natureco_screen_' + Date.now() + '.png');
    try {
      if (PLATFORM === 'darwin') {
        const capture = spawnSync('screencapture', ['-x', outputFile], { timeout: 5000, encoding: 'utf8' });
        if (capture.error) throw capture.error;
        if (capture.status !== 0) return { success: false, ...classifyMacAutomationError(capture.stderr || `screencapture exit ${capture.status}`) };
      } else if (PLATFORM === 'win32') {
        const r = spawnSync('powershell', ['-Command',
          'Add-Type -AssemblyName System.Windows.Forms; ' +
          '$bmp = [System.Drawing.Bitmap]::new([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); ' +
          '$g = [System.Drawing.Graphics]::FromImage($bmp); ' +
          '$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size); ' +
          '$bmp.Save("' + outputFile.replace(/"/g, '') + '", [System.Drawing.Imaging.ImageFormat]::Png)'
        ], { timeout: 10000, encoding: 'utf8' });
        if (r.error) return { success: false, error: 'Windows screenshot hatasi: ' + r.error.message };
        if (r.status !== 0) return { success: false, error: 'Windows screenshot hatasi: ' + (r.stderr || 'exit ' + r.status) };
      } else {
        const r = spawnSync('import', ['-window', 'root', outputFile], { timeout: 5000, encoding: 'utf8' });
        if (r.error) return { success: false, error: 'Linux screenshot hatasi (ImageMagick): ' + r.error.message };
        if (r.status !== 0) return { success: false, error: 'Linux screenshot hatasi: ' + (r.stderr || 'exit ' + r.status) };
      }
      if (!fs.existsSync(outputFile)) throw new Error('Screenshot file was not created');
      return {
        success: true,
        file: outputFile,
        platform: PLATFORM,
        note: 'Screenshot saved. This tool returns a file path, not visual analysis; use computer_use_loop for autonomous visual interaction.',
      };
    } catch (e) {
      return { success: false, error: 'Screenshot hatasi: ' + e.message };
    }
  }

  if (action === 'click') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'x ve y gerekli' };
    const btn = button || 'left';
    if (PLATFORM === 'darwin') {
      const acc = checkAccessibility();
      if (!acc) return accessibilityDenied();
      const r = osaScript('tell application "System Events" to click at {' + x + ', ' + y + '}');
      if (!r.success) return r;
      return { success: true, action: 'click', x, y, button: btn };
    }
    if (PLATFORM === 'win32') {
      const rp = requirePowershell();
      if (rp) return rp;
      const c = clicks || 1;
      const r = windowsClick(x, y, { doubleClick: c > 1, button: btn });
      if (r.error) return { success: false, error: 'Windows click hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows click hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true, action: 'click', x, y, button: btn };
    }
    const rx = requireXdotool();
    if (rx) return rx;
    const r = spawnSync('xdotool', ['mousemove', String(x), String(y), 'click', '1'], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool click hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool click hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true, action: 'click', x, y, button: btn };
  }

  if (action === 'type') {
    if (!text) return { success: false, error: 'text gerekli' };
    if (PLATFORM === 'darwin') {
      const acc = checkAccessibility();
      if (!acc) return accessibilityDenied();
      const r = osaScript('tell application "System Events" to keystroke "' + escapeText(text) + '"');
      if (!r.success) return r;
      return { success: true, action: 'type', text };
    }
    if (PLATFORM === 'win32') {
      const rp = requirePowershell();
      if (rp) return rp;
      const escaped = text.replace(/[{}()^+%~]/g, '{$&}');
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.SendKeys]::SendWait("' + escaped + '")'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows type hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows type hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true, action: 'type', text };
    }
    const rx = requireXdotool();
    if (rx) return rx;
    const r = spawnSync('xdotool', ['type', '--clearmodifiers', text], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool type hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool type hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true, action: 'type', text };
  }

  if (action === 'keypress') {
    if (!key) return { success: false, error: 'key gerekli' };
    if (PLATFORM === 'darwin') {
      const acc = checkAccessibility();
      if (!acc) return accessibilityDenied();

      const parts = key.toLowerCase().split('+').map(p => p.trim());
      const mods = [];
      let actualKey = '';
      for (const p of parts) {
        if (MODIFIER_MAP[p]) mods.push(MODIFIER_MAP[p]);
        else actualKey = p;
      }

      if (KEY_MAP_DARWIN[actualKey]) {
        const keyCodes = { return: 36, tab: 48, escape: 53, up: 126, down: 125, left: 123, right: 124, delete: 51, forwarddelete: 117, home: 115, end: 119, 'page up': 116, 'page down': 121, space: 49 };
        const keyName = KEY_MAP_DARWIN[actualKey];
        const usingClause = mods.length > 0 ? ' using {' + mods.join(', ') + '}' : '';
        const r = osaScript('tell application "System Events" to key code ' + keyCodes[keyName] + usingClause);
        if (!r.success) return r;
      } else if (actualKey) {
        const usingClause = mods.length > 0 ? ' using {' + mods.join(', ') + '}' : '';
        const r = osaScript('tell application "System Events" to keystroke "' + escapeText(actualKey) + '"' + usingClause);
        if (!r.success) return r;
      } else {
        if (mods.length > 0) {
          return { success: false, error: 'Modifier-only keypress not supported. Provide a key with modifiers (e.g. cmd+q).' };
        }
      }
      return { success: true, action: 'keypress', key };
    }
    if (PLATFORM === 'win32') {
      const rp = requirePowershell();
      if (rp) return rp;
      const keyMap = {
        enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', up: '{UP}', down: '{DOWN}',
        left: '{LEFT}', right: '{RIGHT}', backspace: '{BACKSPACE}', delete: '{DELETE}',
        home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
      };
      const psKey = keyMap[key.toLowerCase()] || key;
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.SendKeys]::SendWait("' + psKey.replace(/"/g, '`"') + '")'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows keypress hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows keypress hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true, action: 'keypress', key };
    }
    const rx = requireXdotool();
    if (rx) return rx;
    const r = spawnSync('xdotool', ['key', key], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool keypress hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool keypress hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true, action: 'keypress', key };
  }

  if (action === 'mouse_move') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'x ve y gerekli' };
    if (PLATFORM === 'darwin') {
      const acc = checkAccessibility();
      if (!acc) return accessibilityDenied();
      const r = osaScript('tell application "System Events" to set position of mouse to {' + x + ', ' + y + '}');
      if (!r.success) return r;
      return { success: true, action: 'mouse_move', x, y };
    }
    if (PLATFORM === 'win32') {
      const rp = requirePowershell();
      if (rp) return rp;
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(' + x + ', ' + y + ')'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows mouse_move hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows mouse_move hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true, action: 'mouse_move', x, y };
    }
    const rx = requireXdotool();
    if (rx) return rx;
    const r = spawnSync('xdotool', ['mousemove', String(x), String(y)], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool mouse_move hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool mouse_move hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true, action: 'mouse_move', x, y };
  }

  if (action === 'mouse_position') {
    if (PLATFORM === 'darwin') {
      const r = osaScript('tell application "System Events" to return position of mouse');
      if (!r.success) return r;
      const [mx, my] = r.data.trim().split(', ').map(Number);
      return { success: true, x: mx, y: my };
    }
    if (PLATFORM === 'win32') {
      const r = spawnSync('powershell', ['-Command',
        '[System.Windows.Forms.Cursor]::Position.X.ToString() + ", " + [System.Windows.Forms.Cursor]::Position.Y.ToString()'
      ], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'Windows mouse_position hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows mouse_position hatasi: ' + (r.stderr || 'exit ' + r.status) };
      const [mx, my] = r.stdout.trim().split(', ').map(Number);
      return { success: true, x: mx, y: my };
    }
    const result = spawnSync('xdotool', ['getmouselocation'], { timeout: 5000, encoding: 'utf8' });
    if (result.error) return { success: false, error: 'xdotool mouse_position hatasi: ' + result.error.message };
    if (result.status !== 0) return { success: false, error: 'xdotool mouse_position hatasi: ' + (result.stderr || 'exit ' + result.status) };
    const mx = parseInt(result.stdout.match(/x:(\d+)/)?.[1] || '0');
    const my = parseInt(result.stdout.match(/y:(\d+)/)?.[1] || '0');
    return { success: true, x: mx, y: my };
  }

  if (action === 'scroll') {
    if (typeof y !== 'number') return { success: false, error: 'y (pixels) gerekli' };
    if (PLATFORM === 'darwin') {
      const acc = checkAccessibility();
      if (!acc) return accessibilityDenied();
      const direction = y > 0 ? 'up' : 'down';
      const times = Math.abs(Math.ceil(y / 40));
      const r = osaScript('tell application "System Events" to repeat ' + times + ' times\n  key code 125\nend repeat');
      if (!r.success) return r;

      return { success: true, action: 'scroll', y, note: 'Scrolled ' + direction + ' ' + times + ' steps' };
    }
    if (PLATFORM === 'win32') {
      const rp = requirePowershell();
      if (rp) return rp;
      const direction = y < 0 ? 'Up' : 'Down';
      const times = Math.abs(Math.ceil(y / 40));
      const r = windowsScroll(y);
      if (r.error) return { success: false, error: 'Windows scroll hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'Windows scroll hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true, action: 'scroll', y, note: 'Scrolled ' + direction + ' ' + times + ' steps' };
    }
    const rx = requireXdotool();
    if (rx) return rx;
    const r = spawnSync('xdotool', ['click', y < 0 ? '4' : '5', '--repeat', String(Math.abs(Math.ceil(y / 50)))], { timeout: 5000, encoding: 'utf8' });
    if (r.error) return { success: false, error: 'xdotool scroll hatasi: ' + r.error.message };
    if (r.status !== 0) return { success: false, error: 'xdotool scroll hatasi: ' + (r.stderr || 'exit ' + r.status) };
    return { success: true, action: 'scroll', y };
  }

  if (action === 'drag') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'x ve y (baslangic) gerekli' };
    const x2 = params.x2, y2 = params.y2;
    if (typeof x2 !== 'number' || typeof y2 !== 'number') return { success: false, error: 'x2 ve y2 (bitis) gerekli' };
    if (PLATFORM === 'darwin') {
      const acc = checkAccessibility();
      if (!acc) return accessibilityDenied();
      const r = osaScript('tell application "System Events"\n  set mousePos to {' + x + ', ' + y + '}\n  set mousePos2 to {' + x2 + ', ' + y2 + '}\n  set position of mouse to mousePos\n  delay 0.1\n  mouse down\n  set position of mouse to mousePos2\n  delay 0.1\n  mouse up\nend tell');
      if (!r.success) return r;
      return { success: true, action: 'drag', from: { x, y }, to: { x: x2, y: y2 } };
    }
    if (PLATFORM === 'linux') {
      const rx = requireXdotool();
      if (rx) return rx;
      const r = spawnSync('xdotool', ['mousemove', String(x), String(y), 'mousedown', '1', 'mousemove', String(x2), String(y2), 'mouseup', '1'], { timeout: 5000, encoding: 'utf8' });
      if (r.error) return { success: false, error: 'xdotool drag hatasi: ' + r.error.message };
      if (r.status !== 0) return { success: false, error: 'xdotool drag hatasi: ' + (r.stderr || 'exit ' + r.status) };
      return { success: true, action: 'drag', from: { x, y }, to: { x: x2, y: y2 } };
    }
    return { success: false, error: 'drag only supported on macOS and Linux' };
  }

  if (action === 'info') {
    const displays = [];
    try {
      if (PLATFORM === 'darwin') {
        const result = spawnSync('system_profiler', ['SPDisplaysDataType'], { timeout: 5000, encoding: 'utf8' });
        for (const line of result.stdout.split('\n')) {
          const m = line.match(/(\d+) x (\d+)/);
          if (m) displays.push({ width: parseInt(m[1]), height: parseInt(m[2]) });
        }
      }
    } catch {}
    return { success: true, platform: PLATFORM, displays: displays.length > 0 ? displays : undefined };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (screenshot, click, type, keypress, mouse_move, mouse_position, scroll, drag, info)' };
}

module.exports = {
  name: 'computer_use',
  description: 'GUI otomasyonu: screenshot, click, type, keypress, mouse_move, mouse_position, scroll, drag, info. macOS/Windows/Linux.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'screenshot, click, type, keypress, mouse_move, mouse_position, scroll, drag, info', enum: ['screenshot', 'click', 'type', 'keypress', 'mouse_move', 'mouse_position', 'scroll', 'drag', 'info'] },
      x: { type: 'number', description: 'X koordinati' },
      y: { type: 'number', description: 'Y koordinati' },
      button: { type: 'string', description: 'Fare tusu: left, right, middle (default: left)' },
      clicks: { type: 'number', description: 'Tiklama sayisi (default: 1)' },
      key: { type: 'string', description: '(keypress) Tus adi veya kombinasyon: enter, tab, escape, up, down, left, right, backspace, delete, cmd+q, cmd+shift+z, alt+space' },
      x2: { type: 'number', description: '(drag) Bitis X koordinati' },
      y2: { type: 'number', description: '(drag) Bitis Y koordinati' },
      text: { type: 'string', description: '(type) Yazilacak metin' },
      file: { type: 'string', description: '(screenshot) Kayit dosyasi' },
    },
    required: ['action'],
  },
  async execute(params) { return await computerUse(params); },
};
