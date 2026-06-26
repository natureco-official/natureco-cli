const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PLATFORM = os.platform();

async function computerUse(params) {
  const { action, x, y, key, text, button, clicks, query, file } = params;

  if (action === 'screenshot') {
    const outputFile = file || path.join(os.tmpdir(), 'natureco_screen_' + Date.now() + '.png');
    if (PLATFORM === 'darwin') {
      execSync('screencapture -x "' + outputFile + '"', { timeout: 5000 });
    } else if (PLATFORM === 'win32') {
      execSync('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $bmp = [System.Drawing.Bitmap]::new([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0, 0, 0, 0, $bmp.Size); $bmp.Save(\\"' + outputFile + '\\", [System.Drawing.Imaging.ImageFormat]::Png)"', { timeout: 10000 });
    } else {
      execSync('import -window root "' + outputFile + '"', { timeout: 5000 });
    }
    return { success: true, file: outputFile, platform: PLATFORM, note: 'Ekran goruntusu alindi: ' + outputFile };
  }

  if (action === 'click') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'x ve y gerekli' };
    const btn = button || 'left';
    if (PLATFORM === 'darwin') {
      execSync('osascript -e \'tell application "System Events" to click at {' + x + ', ' + y + '}\'', { timeout: 5000 });
    } else if (PLATFORM === 'win32') {
      const c = clicks || 1;
      execSync('powershell -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(' + x + ', ' + y + '); [System.Windows.Forms.SendKeys]::SendWait(\\"' + (c > 1 ? '{DOUBLECLICK}' : '{CLICK}') + '\\")"', { timeout: 5000 });
    } else {
      execSync('xdotool mousemove ' + x + ' ' + y + ' click 1', { timeout: 5000 });
    }
    return { success: true, action: 'click', x, y, button };
  }

  if (action === 'type') {
    if (!text) return { success: false, error: 'text gerekli' };
    if (PLATFORM === 'darwin') {
      const safeText = text.replace(/"/g, '\\"');
      execSync('osascript -e \'tell application "System Events" to keystroke "' + safeText + '"\'', { timeout: 5000 });
    } else if (PLATFORM === 'win32') {
      execSync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\\"' + text.replace(/[{}()^+% ~]/g, '{$&}') + '\\")"', { timeout: 5000 });
    } else {
      execSync('xdotool type "' + text.replace(/"/g, '\\"') + '"', { timeout: 5000 });
    }
    return { success: true, action: 'type', text };
  }

  if (action === 'keypress') {
    if (!key) return { success: false, error: 'key gerekli' };
    if (PLATFORM === 'darwin') {
      const keyMap = { enter: 'return', tab: 'tab', escape: 'escape', up: 'up', down: 'down', left: 'left', right: 'right', backspace: 'delete', delete: 'forwarddelete' };
      const k = keyMap[key.toLowerCase()] || key;
      execSync('osascript -e \'tell application "System Events" to key code ' + (isNaN(k) ? '"' + k + '"' : k) + '\'', { timeout: 5000 });
    } else if (PLATFORM === 'win32') {
      const keyMap = { enter: '{ENTER}', tab: '{TAB}', escape: '{ESC}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', backspace: '{BACKSPACE}', delete: '{DELETE}' };
      execSync('powershell -Command "[System.Windows.Forms.SendKeys]::SendWait(\\"' + (keyMap[key.toLowerCase()] || key) + '\\")"', { timeout: 5000 });
    } else {
      execSync('xdotool key ' + key, { timeout: 5000 });
    }
    return { success: true, action: 'keypress', key };
  }

  if (action === 'mouse_move') {
    if (typeof x !== 'number' || typeof y !== 'number') return { success: false, error: 'x ve y gerekli' };
    if (PLATFORM === 'darwin') {
      execSync('osascript -e \'tell application "System Events" to set position of mouse to {' + x + ', ' + y + '}\'', { timeout: 5000 });
    } else if (PLATFORM === 'win32') {
      execSync('powershell -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(' + x + ', ' + y + ')"', { timeout: 5000 });
    } else {
      execSync('xdotool mousemove ' + x + ' ' + y, { timeout: 5000 });
    }
    return { success: true, action: 'mouse_move', x, y };
  }

  if (action === 'mouse_position') {
    if (PLATFORM === 'darwin') {
      const out = execSync('osascript -e \'tell application "System Events" to return position of mouse\'', { timeout: 5000 }).toString().trim();
      const [mx, my] = out.split(', ').map(Number);
      return { success: true, x: mx, y: my };
    } else if (PLATFORM === 'win32') {
      const out = execSync('powershell -Command "[System.Windows.Forms.Cursor]::Position.X.ToString() + \\", \\" + [System.Windows.Forms.Cursor]::Position.Y.ToString()"', { timeout: 5000 }).toString().trim();
      const [mx, my] = out.split(', ').map(Number);
      return { success: true, x: mx, y: my };
    } else {
      const out = execSync('xdotool getmouselocation', { timeout: 5000 }).toString().trim();
      const mx = parseInt(out.match(/x:(\d+)/)?.[1] || '0');
      const my = parseInt(out.match(/y:(\d+)/)?.[1] || '0');
      return { success: true, x: mx, y: my };
    }
  }

  if (action === 'scroll') {
    if (typeof y !== 'number') return { success: false, error: 'y (pixels) gerekli' };
    if (PLATFORM === 'darwin') {
      execSync('osascript -e \'tell application "System Events" to scroll (current application)\' &', { timeout: 5000 }); // simplified
      return { success: true, action: 'scroll', y, note: 'macOS scroll icin Accessibility izni gerekli' };
    } else {
      execSync('xdotool click ' + (y < 0 ? '4' : '5') + ' --repeat ' + Math.abs(Math.ceil(y / 50)), { timeout: 5000 });
      return { success: true, action: 'scroll', y };
    }
  }

  if (action === 'info') {
    const displays = [];
    try {
      if (PLATFORM === 'darwin') {
        const out = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep Resolution', { timeout: 5000 }).toString();
        for (const line of out.trim().split('\n')) {
          const m = line.match(/(\d+) x (\d+)/);
          if (m) displays.push({ width: parseInt(m[1]), height: parseInt(m[2]) });
        }
      }
    } catch {}
    return { success: true, platform: PLATFORM, displays: displays.length > 0 ? displays : undefined, note: 'Ekran bilgisi' };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (screenshot, click, type, keypress, mouse_move, mouse_position, scroll, info)' };
}

module.exports = {
  name: 'computer_use',
  description: 'GUI otomasyonu: screenshot, click, type, keypress, mouse_move, mouse_position, scroll, info. macOS/Windows/Linux.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'screenshot, click, type, keypress, mouse_move, mouse_position, scroll, info', enum: ['screenshot', 'click', 'type', 'keypress', 'mouse_move', 'mouse_position', 'scroll', 'info'] },
      x: { type: 'number', description: 'X koordinati' },
      y: { type: 'number', description: 'Y koordinati' },
      button: { type: 'string', description: 'Fare tusu: left, right, middle (default: left)' },
      clicks: { type: 'number', description: 'Tiklama sayisi (default: 1)' },
      key: { type: 'string', description: '(keypress) Tus adi: enter, tab, escape, up, down, left, right, backspace, delete' },
      text: { type: 'string', description: '(type) Yazilacak metin' },
      query: { type: 'string', description: 'Arama sorgusu' },
      file: { type: 'string', description: '(screenshot) Kayit dosyasi' },
    },
    required: ['action'],
  },
  async execute(params) { return await computerUse(params); },
};
